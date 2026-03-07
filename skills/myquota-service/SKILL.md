---
name: myquota-service
description: >
  Patrones de BaseService: inyección de dependencias, lógica de negocio, métodos heredados.
  Trigger: Cuando se crea un servicio, se agrega lógica de negocio, o se necesita inyección de dependencias.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Creating a service"
    - "Adding business logic"
    - "Injecting dependencies"
---

## Propósito

Crear servicios en MyQuota usando `BaseService<T>` como base. Los servicios contienen toda la lógica de negocio.

---

## Patrón Base

```typescript
import { BaseService } from "@shared/classes/base.service";
import { MyEntity } from "./myEntity.model";
import { MyEntityRepository } from "./myEntity.repository";

export class MyEntityService extends BaseService<MyEntity> {
  protected repository: MyEntityRepository;

  constructor(repository: MyEntityRepository) {
    super(repository);
    this.repository = repository;
  }
}
```

---

## Métodos Heredados de BaseService

| Método       | Firma                                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| `create`     | `(data: Omit<T, keyof IBaseEntity>) => Promise<T>`                              |
| `findAll`    | `(filters?: Partial<T>) => Promise<T[]>`                                        |
| `findById`   | `(id: string) => Promise<T \| null>`                                            |
| `findOne`    | `(filters: Partial<T>) => Promise<T \| null>`                                   |
| `update`     | `(id: string, data: Partial<Omit<T, keyof IBaseEntity>>) => Promise<T \| null>` |
| `delete`     | `(id: string) => Promise<boolean>`                                              |
| `softDelete` | `(id: string) => Promise<boolean>`                                              |

---

## Reglas de Service

### 1. Constructor recibe repository

```typescript
// ✅ CORRECTO
constructor(repository: MyEntityRepository) {
  super(repository);
  this.repository = repository;
}

// ❌ INCORRECTO — no instanciar internamente
constructor(userId: string) {
  const repository = new MyEntityRepository(userId); // NO
  super(repository);
}
```

### 2. Declarar protected repository

Para acceder a métodos custom del repository específico:

```typescript
export class MyEntityService extends BaseService<MyEntity> {
  protected repository: MyEntityRepository; // ← Tipo específico

  constructor(repository: MyEntityRepository) {
    super(repository);
    this.repository = repository;
  }

  async findByStatus(status: string): Promise<MyEntity[]> {
    // Ahora puedes acceder a métodos custom del repo
    return this.repository.findByStatus(status);
  }
}
```

### 3. Lógica de negocio aquí

```typescript
async createWithValidation(data: CreateMyEntityDto): Promise<MyEntity> {
  // Validaciones
  if (!data.name) {
    throw new Error("El nombre es requerido");
  }

  if (data.amount < 0) {
    throw new Error("El monto debe ser positivo");
  }

  // Transformaciones
  const normalized = {
    ...data,
    name: data.name.trim().toUpperCase(),
  };

  // Crear
  return this.create(normalized);
}
```

---

## Inyección de Múltiples Dependencias

Cuando un servicio necesita datos de otro módulo:

```typescript
export class TransactionService extends BaseService<Transaction> {
  protected repository: TransactionRepository;

  constructor(
    repository: TransactionRepository,
    private quotaRepository: QuotaRepository, // Otra dependencia
    private categoryService: CategoryService, // Otro servicio
  ) {
    super(repository);
    this.repository = repository;
  }

  async createWithQuotas(data: CreateTransactionDto): Promise<Transaction> {
    const transaction = await this.create(data);

    // Usar la otra dependencia
    for (const quotaData of data.quotas) {
      await this.quotaRepository.create({
        transactionId: transaction.id,
        ...quotaData,
      });
    }

    return transaction;
  }
}
```

La instanciación de todas las dependencias ocurre en **routes.ts**:

```typescript
// En el middleware de routes.ts
const transactionRepo = new TransactionRepository(userId, creditCardId);
const quotaRepo = new QuotaRepository(userId, creditCardId, transactionId);
const categoryService = new CategoryService(new CategoryRepository(userId));

const service = new TransactionService(
  transactionRepo,
  quotaRepo,
  categoryService,
);
```

---

## Servicios sin BaseService

Para servicios que no tienen entidad CRUD propia (como `AuthService`, `StatsService`):

```typescript
// src/modules/stats/stats.service.ts

/**
 * StatsService no tiene entidad CRUD propia.
 * Agrega datos de múltiples repositorios para calcular estadísticas.
 */
export class StatsService {
  constructor(
    private creditCardRepository: CreditCardRepository,
    private transactionRepository: TransactionRepository,
  ) {}

  async getDebtSummary(): Promise<DebtSummary> {
    const cards = await this.creditCardRepository.findAll();
    // ... cálculos
    return summary;
  }
}
```

---

## Anti-patterns

```typescript
// ❌ No acceder a req.body sin pasar por controller
async create(req: Request): Promise<MyEntity> {
  return this.repository.create(req.body);
}

// ❌ No instanciar repositorios internamente
constructor(userId: string) {
  this.repository = new MyEntityRepository(userId);
}

// ❌ No hacer lógica de presentación
async getAllFormatted(): Promise<string[]> {
  const items = await this.findAll();
  return items.map(i => `${i.name}: $${i.amount}`); // Esto va en controller
}
```

---

## Checklist

- [ ] Extiende `BaseService<T>` (o documenta si no aplica)
- [ ] Constructor recibe repository por parámetro
- [ ] `protected repository: SpecificRepository` declarado
- [ ] Lógica de negocio en métodos del servicio
- [ ] Validaciones de entrada en el servicio
- [ ] Dependencias adicionales inyectadas por constructor
- [ ] NO instancia repositorios internamente
