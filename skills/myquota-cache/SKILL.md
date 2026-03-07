---
name: myquota-cache
description: >
  Sistema de caché de 3 niveles: memoria (L1), Firestore summaries (L2), cómputo full (L3).
  Trigger: Cuando se implementa caché, vistas materializadas, o endpoints costosos en reads.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Implementing caching"
    - "Creating materialized views"
    - "Optimizing expensive reads"
---

## Propósito

Reducir reads de Firestore en endpoints costosos usando el patrón de 3 niveles de caché.

---

## El Problema

En Spark plan (free), Firestore tiene 50K reads/día. Algunos endpoints agregan muchos documentos:

- `GET /stats/debt-summary` ≈ 789 reads en cold start
- Cache en memoria se reinicia cuando el servidor duerme (Render: ~15 min inactividad)

---

## Solución: 3 Niveles de Caché

```
GET request:
  ├── L1: CacheService (memoria)     → hit? return               (0 reads)
  ├── L2: Firestore summary doc      → existe y fresco? return   (1 read)
  └── L3: Compute full Firestore     → guardar L2 + L1 → return  (N reads)

POST/PUT/DELETE request:
  ├── Invalidar L1 inmediatamente (síncrono)
  └── Recomputar async → persistir en L2 (fire-and-forget)
```

---

## Cuándo Usar Este Patrón

Aplicar cuando **TODAS** estas condiciones se cumplen:

1. El resultado requiere **más de 50 reads** de Firestore
2. El resultado **solo cambia cuando el usuario escribe datos**
3. El endpoint se llama con **frecuencia alta** (Dashboard, stats)
4. La **latencia de cómputo** sería perceptible (> 500ms)

### Cuándo NO Usar

- Consultas simples (< 20 reads) → solo CacheService en memoria
- Datos en tiempo real (cotizaciones, fechas)
- Endpoints de escritura

---

## Summaries en Firestore

| Summary        | Path                                                       | Service      |
| -------------- | ---------------------------------------------------------- | ------------ |
| `debtSummary`  | `users/{userId}/summaries/debtSummary`                     | StatsService |
| `monthlyStats` | `users/{userId}/creditCards/{ccId}/summaries/monthlyStats` | StatsService |

Estructura del documento:

```json
{
  "data": {
    /* DebtSummary | MonthlyStatEntry[] */
  },
  "computedAt": "2025-03-03T10:00:00.000Z"
}
```

---

## Implementación

### 1. Ref helper privado

```typescript
private static mySummaryRef(userId: string) {
  return db
    .collection("users").doc(userId)
    .collection("summaries").doc("mySummary");
}
```

### 2. Cómputo puro

```typescript
private static async _computeMySummary(userId: string): Promise<MySummary> {
  // ... lógica con reads de Firestore. Sin caching aquí.
}
```

### 3. Método público con 3 niveles

```typescript
static async getMySummary(userId: string): Promise<MySummary> {
  // L1: memoria
  const memKey = CacheKeys.mySummary(userId);
  const cached = CacheService.get<MySummary>(memKey);
  if (cached !== null) return cached;

  // L2: Firestore summary (1 read)
  try {
    const doc = await MyService.mySummaryRef(userId).get();
    if (doc.exists) {
      const raw = doc.data()!;
      const ageMs = Date.now() - new Date(raw.computedAt as string).getTime();
      if (ageMs < 30 * 60 * 1000) {   // 30 min de frescura
        const summary = raw.data as MySummary;
        CacheService.set(memKey, summary, CacheTTL.LONG);
        return summary;
      }
    }
  } catch (err) {
    console.error("Failed to read summary from Firestore:", err);
    // fallback silencioso → continúa a L3
  }

  // L3: cómputo completo (~N reads)
  const result = await MyService._computeMySummary(userId);

  // Persistir L2 async (no bloquea)
  MyService.mySummaryRef(userId)
    .set({ data: result, computedAt: new Date().toISOString() })
    .catch((err) => console.error("Failed to persist summary:", err));

  // Guardar L1
  CacheService.set(memKey, result, CacheTTL.LONG);

  return result;
}
```

---

## Invalidación desde Controllers

Después de cada write, usar `StatsService.triggerRecompute`:

```typescript
// En controller después de create/update/delete exitoso
const userId = req.user?.userId;
if (userId) {
  StatsService.triggerRecompute(userId, req.params.creditCardId);
}
```

`triggerRecompute()`:

1. Invalida L1 inmediatamente (síncrono)
2. Dispara recompute de summaries en background (sin await)

---

## CacheService

Ubicación: `src/shared/services/cache.service.ts`

```typescript
// Keys disponibles
CacheKeys.mySummary(userId)
CacheKeys.debtSummary(userId)
CacheKeys.monthlyStats(userId, creditCardId)

// TTL disponibles
CacheTTL.SHORT  // 5 min
CacheTTL.MEDIUM // 15 min
CacheTTL.LONG   // 30 min

// Métodos
CacheService.get<T>(key): T | null
CacheService.set<T>(key, value, ttl): void
CacheService.invalidate(key): void
CacheService.invalidateByPrefix(prefix): void
```

---

## Reglas Obligatorias

1. **NUNCA** bloquear respuesta con `await` al persistir L2

   ```typescript
   // ✅
   ref.set(...).catch(console.error);

   // ❌
   await ref.set(...);
   ```

2. **SIEMPRE** try/catch en L2 con fallback a L3

3. **Agregar clave** del summary a `CacheKeys`

4. **Documentar costo** de L3 en JSDoc

   ```typescript
   /**
    * L3: full compute (~789 reads)
    */
   ```

5. **NO llamar** `CacheService.invalidateByPrefix` directamente desde controllers
   → usar siempre `StatsService.triggerRecompute`

6. Summary tiene **30 min de frescura máxima** (`SUMMARY_MAX_AGE_MS`)

---

## Checklist

- [ ] Endpoint realmente necesita caché (>50 reads)
- [ ] Ref helper creado para el summary
- [ ] Método de cómputo puro separado (`_compute...`)
- [ ] L1 → L2 → L3 implementado correctamente
- [ ] L2 persist es fire-and-forget (sin await)
- [ ] try/catch en L2 con fallback
- [ ] Clave agregada a CacheKeys
- [ ] Controllers usan triggerRecompute después de writes
