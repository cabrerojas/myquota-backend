---
name: myquota-repository
description: >
  SupabaseRepository patterns: table ownership, SQL-level filters, CRUD methods, and camelCase/snake_case mapping.
  Trigger: When creating a repository, working with Supabase/Postgres persistence, or adding custom repository methods.
license: MIT
metadata:
  author: myquota
  version: "1.1"
  auto_invoke:
    - "Creating a repository"
    - "Working with Supabase repositories"
    - "Adding custom repository methods"
---

## Purpose

Use `SupabaseRepository<T>` as the default base class for persistence in MyQuota. Repositories own one table or a tightly-scoped persistence boundary.

## Base Pattern

```typescript
import { SupabaseRepository } from "@shared/classes/supabase.repository";
import { MyEntity } from "./myEntity.model";

export class MyEntityRepository extends SupabaseRepository<MyEntity> {
  constructor() {
    super("my_entities");
  }
}
```

## Rules

- Pass the real Postgres table or view name to `super()`.
- Keep entity fields camelCase. The base repository maps common snake_case DB columns.
- Push filtering, ordering, pagination, and range constraints down to SQL/repository level.
- Do not fetch broad result sets and filter in memory when SQL can express the predicate.
- A repository must not depend on another repository. Cross-module orchestration belongs in services or dedicated SQL helpers.

## Current Persistence Shape

Core tables currently include:

- `users`
- `credit_cards`
- `transactions`
- `quotas`
- `billing_periods`
- `categories`
- `user_tokens`
- `revoked_tokens`

## Inherited Methods

| Method | Signature | Notes |
| --- | --- | --- |
| `create` | `(data) => Promise<T>` | Adds id and timestamps |
| `findAll` | `(filters?, pagination?) => Promise<QueryResult<T>>` | Uses soft-delete filter and pagination |
| `findById` | `(id) => Promise<T \| null>` | Returns `null` when not found |
| `findOne` | `(filters) => Promise<T \| null>` | Equality filters only |
| `update` | `(id, data) => Promise<T \| null>` | Updates `updated_at` |
| `delete` | `(id) => Promise<boolean>` | Hard delete |
| `softDelete` | `(id) => Promise<boolean>` | Sets `deleted_at` |

## Custom Method Pattern

```typescript
import {
  QueryResult,
  SupabaseRepository,
} from "@shared/classes/supabase.repository";

export class TransactionRepository extends SupabaseRepository<Transaction> {
  constructor() {
    super("transactions");
  }

  async findPendingByCreditCard(
    creditCardId: string,
  ): Promise<QueryResult<Transaction>> {
    return this.findAll(
      { creditCardId, status: "pending" } as Partial<Transaction>,
      { orderBy: "transactionDate", orderDirection: "desc", limit: 100 },
    );
  }
}
```

## Mapping Rule

If you override base behavior, preserve the base mapping layer.

```typescript
protected override mapRowToEntity(row: Record<string, unknown>): MyEntity {
  const entity = super.mapRowToEntity(row);
  return {
    ...entity,
    customField: row.custom_field as string,
  };
}
```

## Never

- Never import another repository into a repository.
- Never read `process.env` in repositories.
- Never add business rules that belong in services.
- Never keep Firestore-era path or subcollection patterns in new repository guidance.

## Checklist

- [ ] Extends `SupabaseRepository<T>` unless a dedicated SQL helper is justified
- [ ] Uses the correct table/view name in `super()`
- [ ] Pushes filters and pagination into SQL
- [ ] Preserves camelCase/snake_case mapping when overriding base behavior
- [ ] Does not depend on other repositories for cross-module reads
