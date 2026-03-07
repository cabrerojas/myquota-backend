---
name: sync-types
description: >
  Sincronización de tipos entre backend y frontend. Mapeo de modelos a interfaces.
  Trigger: Cuando se modifica un modelo del backend o se necesita sincronizar tipos con la app.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Modifying backend models"
    - "Syncing types with frontend"
    - "Adding fields to entities"
---

## Propósito

Mantener sincronizados los tipos entre `myquota-backend` y `myquota-app` cuando se modifican entidades.

---

## Mapeo de Tipos

| Modelo Backend (`src/modules/*/model.ts`) | Tipo Frontend (`myquota-app/src/shared/types/`) |
| ----------------------------------------- | ----------------------------------------------- |
| `CreditCard`                              | `creditCard.ts` → `CreditCard`                  |
| `Transaction`                             | `transaction.ts` → `Transaction`                |
| `Quota`                                   | `quota.ts` → `Quota`                            |
| `BillingPeriod`                           | `billingPeriod.ts` → `BillingPeriod`            |
| `User`                                    | `user.ts` → `UserInfo`                          |
| `Category`                                | `category.ts` → `Category`                      |

---

## Regla Principal

> Cuando se agrega, renombra o elimina un campo en una entidad del backend,
> **TAMBIÉN** se debe actualizar la interface correspondiente en `myquota-app/src/shared/types/`.

---

## Ejemplo: Agregar Campo

### 1. Backend: Modificar modelo

```typescript
// myquota-backend/src/modules/creditCard/creditCard.model.ts
export class CreditCard implements IBaseEntity {
  id!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;

  name!: string;
  lastFourDigits!: string;
  color!: string;
  newField!: string; // ← NUEVO CAMPO
}
```

### 2. Frontend: Actualizar interface

```typescript
// myquota-app/src/shared/types/creditCard.ts
export interface CreditCard {
  id: string;
  createdAt: string; // ISO string en frontend
  updatedAt: string;
  deletedAt?: string | null;

  name: string;
  lastFourDigits: string;
  color: string;
  newField: string; // ← SINCRONIZAR
}
```

---

## Diferencias Backend ↔ Frontend

| Aspecto           | Backend                  | Frontend                   |
| ----------------- | ------------------------ | -------------------------- |
| Sintaxis          | `class` con `!:`         | `interface`                |
| Fechas            | `Date`                   | `string` (ISO 8601)        |
| IBaseEntity       | `implements IBaseEntity` | Copiar campos directamente |
| Campos opcionales | `?: Type \| null`        | `?: Type \| null`          |

### Conversión de Fechas

```typescript
// Backend model
createdAt!: Date;

// Frontend interface
createdAt: string;  // "2025-03-15T00:00:00.000Z"
```

La API serializa `Date` a ISO strings, por lo que el frontend siempre recibe strings.

---

## Checklist al Modificar Modelos

- [ ] Campo agregado/modificado en backend (`src/modules/*/model.ts`)
- [ ] Interface actualizada en frontend (`myquota-app/src/shared/types/`)
- [ ] Si es fecha: backend `Date`, frontend `string`
- [ ] Si es opcional: ambos usan `?:`
- [ ] Documentar en commit/PR qué tipos se sincronizaron

---

## Estructura IBaseEntity

Todos los modelos del backend implementan `IBaseEntity`:

```typescript
// Backend
export interface IBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}
```

En frontend, estos campos se incluyen directamente:

```typescript
// Frontend
export interface SomeEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  // ... campos específicos
}
```

---

## Anti-patterns

```typescript
// ❌ Modificar backend sin actualizar frontend
// Causa: runtime errors, tipos incorrectos

// ❌ Usar Date en frontend
createdAt: Date; // Incorrecto, la API devuelve string

// ❌ Nombres distintos
// Backend: dueDate
// Frontend: due_date  // Incorrecto
```

---

## Rutas de Archivos

### Backend

```
myquota-backend/src/modules/
├── creditCard/creditCard.model.ts
├── transaction/transaction.model.ts
├── quota/quota.model.ts
├── billingPeriod/billingPeriod.model.ts
├── user/user.model.ts
└── category/category.model.ts
```

### Frontend

```
myquota-app/src/shared/types/
├── creditCard.ts
├── transaction.ts
├── quota.ts
├── billingPeriod.ts
├── user.ts
└── category.ts
```
