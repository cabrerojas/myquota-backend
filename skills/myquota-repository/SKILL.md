---
name: myquota-repository
description: >
  Patrones de FirestoreRepository: paths, subcolecciones, métodos CRUD, sanitización de timestamps.
  Trigger: Cuando se crea un repositorio, se trabaja con paths de Firestore, o se necesitan métodos custom.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Creating a repository"
    - "Working with Firestore paths"
    - "Adding custom repository methods"
---

## Propósito

Crear y extender repositorios en MyQuota usando `FirestoreRepository<T>` como base. Los repositorios manejan toda la persistencia en Firestore.

---

## Patrón Base

```typescript
import { FirestoreRepository } from "@shared/classes/firestore.repository";
import { MyEntity } from "./myEntity.model";

export class MyEntityRepository extends FirestoreRepository<MyEntity> {
  constructor(userId: string) {
    super(["users", userId], "myEntities");
  }
}
```

---

## Regla de Path

El array `path` del constructor representa pares `[collection, docId, collection, docId, ...]` que conducen al documento padre. `collectionName` es la colección final.

```typescript
// users/{userId}/creditCards/{creditCardId}/transactions
super(["users", userId, "creditCards", creditCardId], "transactions");

// users/{userId}/creditCards
super(["users", userId], "creditCards");

// Colección raíz (users)
super([], "users");
```

---

## Estructura Actual de Firestore

```
users/
├── {userId}/
│   ├── creditCards/
│   │   ├── {creditCardId}/
│   │   │   ├── transactions/
│   │   │   │   ├── {transactionId}/
│   │   │   │   │   └── quotas/
│   │   │   │   │       └── {quotaId}
│   │   │   └── billingPeriods/
│   │   │       └── {billingPeriodId}
│   └── categories/
│       └── {categoryId}
│
categories/                    # Globales (sin userId)
├── {categoryId}/
│   └── merchants/
│       └── {merchantId}
```

---

## Métodos Heredados de FirestoreRepository

| Método       | Firma                                                  | Descripción                  |
| ------------ | ------------------------------------------------------ | ---------------------------- |
| `create`     | `(data: Omit<T, keyof IBaseEntity>) => Promise<T>`     | Crea con id, timestamps auto |
| `findAll`    | `(filters?: Partial<T>) => Promise<T[]>`               | Todos (excluye soft-deleted) |
| `findById`   | `(id: string) => Promise<T \| null>`                   | Por ID                       |
| `findOne`    | `(filters: Partial<T>) => Promise<T \| null>`          | Primero que coincida         |
| `update`     | `(id: string, data: Partial<T>) => Promise<T \| null>` | Actualiza + updatedAt        |
| `delete`     | `(id: string) => Promise<boolean>`                     | Eliminación física           |
| `softDelete` | `(id: string) => Promise<boolean>`                     | Asigna deletedAt             |

---

## Métodos Custom

Para agregar métodos específicos del dominio:

```typescript
export class TransactionRepository extends FirestoreRepository<Transaction> {
  constructor(userId: string, creditCardId: string) {
    super(["users", userId, "creditCards", creditCardId], "transactions");
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    const all = await this.findAll();
    return all.filter((t) => {
      const date = new Date(t.transactionDate);
      return date >= startDate && date <= endDate;
    });
  }

  async findPending(): Promise<Transaction[]> {
    return this.findAll({ status: "pending" } as Partial<Transaction>);
  }
}
```

---

## Sanitización de Timestamps

Al **leer** de Firestore, los Timestamps se convierten a ISO strings:

```typescript
// Interno en FirestoreRepository
sanitizeTimestamps(data: T): T {
  // Convierte Timestamp y Date a ISO strings
}
```

Al **escribir** en Firestore, las Dates se convierten a ISO strings:

```typescript
// Interno en FirestoreRepository
datesToIsoStrings(data: Partial<T>): Record<string, unknown> {
  // Convierte Date a ISO strings, elimina undefined
}
```

Si sobrescribes métodos del base, DEBES llamar a estas funciones:

```typescript
async customFind(): Promise<MyEntity[]> {
  const snapshot = await this.collection.get();
  return snapshot.docs.map(doc =>
    this.sanitizeTimestamps({ id: doc.id, ...doc.data() } as MyEntity)
  );
}

async customCreate(data: Partial<MyEntity>): Promise<MyEntity> {
  const sanitized = this.datesToIsoStrings(data);
  // ... write to Firestore
}
```

---

## Regla de Límites

**Un repositorio gestiona SOLO su colección y sus subcolecciones directas.** NO importar ni depender de otros repositorios.

Acceder a subcollections dentro de la jerarquía propia está permitido (e.g., TransactionRepository accediendo a `quotas` que es subcolección de transactions).

```typescript
// ❌ INCORRECTO: Repository importando otro repository
import { CreditCardRepository } from "@modules/creditCard/creditCard.repository";

class TransactionRepository {
  constructor(
    userId: string,
    creditCardId: string,
    private creditCardRepo: CreditCardRepository, // NO
  ) { ... }
}

// ✅ CORRECTO: Acceder a subcollection propia (quotas dentro de transactions)
class TransactionRepository {
  getQuotasCollection(transactionId: string) {
    return this.repository.doc(transactionId).collection("quotas");
  }
}

// ✅ CORRECTO: Cross-module access via service (DI)
class TransactionService {
  constructor(
    private transactionRepo: TransactionRepository,
    private creditCardRepo: CreditCardRepository, // Inyectado desde routes
  ) {}
}
```

**Regla clave**: Si necesitas datos de otra colección, inyéctalos como dependencia del **service**, no del repository.

---

## Checklist

- [ ] Extiende `FirestoreRepository<T>`
- [ ] Constructor recibe IDs dinámicos necesarios
- [ ] Path correcto: pares [collection, docId, ...]
- [ ] CollectionName es la colección final
- [ ] Métodos custom llaman a sanitizeTimestamps/datesToIsoStrings
- [ ] NO accede a subcolecciones de otras entidades
