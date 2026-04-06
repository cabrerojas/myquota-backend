---
name: myquota-dates
description: >
  Manejo de fechas y zona horaria Chile. Serialización ISO, Firestore timestamps, utilidades.
  Trigger: Cuando se trabaja con fechas, zona horaria, o serialización de timestamps.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Working with dates"
    - "Handling Chile timezone"
    - "Serializing timestamps"
---

## Propósito

Manejar fechas consistentemente en MyQuota usando zona horaria `America/Santiago` y serialización ISO 8601.

---

## Zona Horaria

El proyecto usa **`America/Santiago`** como zona horaria de referencia.

---

## Utilidades Disponibles

Ubicación: `src/shared/utils/date.utils.ts`

| Función                                | Propósito                             |
| -------------------------------------- | ------------------------------------- |
| `parseFirebaseDate(str)`               | Parsea `"dd/mm/yyyy hh:mm"` a `Date`  |
| `convertUtcToChileTime(date, format?)` | Convierte UTC a hora Chile formateada |
| `toChileStartOfDay(date)`              | Normaliza a las 00:00:00 hora Chile   |
| `toChileEndOfDay(date)`                | Normaliza a las 23:59:59 hora Chile   |

---

## Reglas de Fechas

### Al Escribir en Firestore

`datesToIsoStrings()` del repository convierte `Date` a ISO strings automáticamente:

```typescript
// En FirestoreRepository
private datesToIsoStrings(data: unknown): unknown {
  if (data instanceof Date) {
    return data.toISOString();
  }
  // ... recursivo para objetos
}
```

Esto **evita** que Firestore los convierta a `Timestamp` (que es más difícil de manejar).

### Al Leer de Firestore

`sanitizeTimestamps()` convierte `Timestamp` de Firestore a ISO strings:

```typescript
// En FirestoreRepository
private sanitizeTimestamps(data: FirebaseFirestore.DocumentData): T {
  for (const key in data) {
    if (data[key] instanceof Timestamp) {
      data[key] = data[key].toDate().toISOString();
    }
  }
  return data as T;
}
```

### La API Siempre Devuelve ISO Strings

```json
{
  "id": "abc123",
  "createdAt": "2025-03-15T00:00:00.000Z",
  "dueDate": "2025-04-05T03:00:00.000Z"
}
```

**NUNCA** devolver objetos `Date` o `Timestamp` directamente.

---

## Normalización de Períodos

Para billing periods y consultas con rangos de fechas:

```typescript
import { toChileStartOfDay, toChileEndOfDay } from "@shared/utils/date.utils";

// Inicio del período
const startDate = toChileStartOfDay(new Date(period.startDate));
// → 2025-03-01T00:00:00 en hora Chile

// Fin del período
const endDate = toChileEndOfDay(new Date(period.endDate));
// → 2025-03-31T23:59:59 en hora Chile
```

---

## Parsing Fechas de Email

Los emails del banco vienen con formato local:

```typescript
import { parseFirebaseDate } from "@shared/utils/date.utils";

const dateStr = "15/03/2025 14:30";
const date = parseFirebaseDate(dateStr);
// → Date object
```

---

## Ejemplos de Uso

### Crear entidad con fecha

```typescript
// Service
async createWithDueDate(data: { amount: number; dueDate: Date }) {
  // La fecha llegará al repo y datesToIsoStrings() la convierte
  return this.repository.create({
    amount: data.amount,
    dueDate: data.dueDate,  // Date object está OK
  });
}
```

### Consultar por rango de fechas

```typescript
// Repository (método custom)
async findByDateRange(start: Date, end: Date): Promise<T[]> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const snapshot = await this.collectionRef
    .where("date", ">=", startIso)
    .where("date", "<=", endIso)
    .where("deletedAt", "==", null)
    .get();

  return snapshot.docs.map(doc => this.sanitizeTimestamps(doc.data()));
}
```

---

## Anti-patterns

```typescript
// ❌ Devolver Date object en respuesta
res.json({ date: new Date() });

// ❌ Guardar Timestamp de Firestore directamente
// (usar datesToIsoStrings para evitarlo)

// ❌ Hardcodear offset de timezone
const chileDate = new Date(date.getTime() - 4 * 60 * 60 * 1000);

// ❌ Comparar fechas como strings sin normalizar
if (dateStr1 < dateStr2) // Puede fallar con formatos distintos

// ✅ CORRECTO
const date1 = new Date(dateStr1).toISOString();
const date2 = new Date(dateStr2).toISOString();
if (date1 < date2) // OK, ISO strings son comparables
```

---

## Checklist

- [ ] Fechas en respuestas son ISO 8601 strings
- [ ] No se guardan `Timestamp` de Firestore (usar ISO strings)
- [ ] Usar utilidades de `date.utils.ts` para normalización
- [ ] Períodos de facturación usan `toChileStartOfDay`/`toChileEndOfDay`
- [ ] No hardcodear offset de timezone
