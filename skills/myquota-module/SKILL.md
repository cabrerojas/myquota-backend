---
name: myquota-module
description: >
  Create modules using the model -> repository -> service -> controller -> routes pattern.
  Trigger: When creating a new module, adding a new entity, or generating backend boilerplate.
license: MIT
metadata:
  author: myquota
  version: "1.1"
  auto_invoke:
    - "Creating a new module"
    - "Adding a new entity"
    - "Generating module boilerplate"
---

## Purpose

Create modules that follow the repo's layering while matching the current Supabase/Postgres architecture.

## Standard Structure

```text
src/modules/<moduleName>/
├── <moduleName>.model.ts
├── <moduleName>.schemas.ts
├── <moduleName>.repository.ts
├── <moduleName>.service.ts
├── <moduleName>.controller.ts
└── <moduleName>.routes.ts
```

## Layer Responsibilities

- Model: domain shape implementing `IBaseEntity`
- Repository: persistence only, usually extending `SupabaseRepository<T>`
- Service: business logic and orchestration
- Controller: HTTP-only concerns, try/catch, response formatting
- Routes: middleware order, validation, per-request wiring

## Repository Template

```typescript
import { SupabaseRepository } from "@shared/classes/supabase.repository";
import { MyEntity } from "./myEntity.model";

export class MyEntityRepository extends SupabaseRepository<MyEntity> {
  constructor() {
    super("my_entities");
  }
}
```

## Service Template

```typescript
import { BaseService } from "@shared/classes/base.service";

export class MyEntityService extends BaseService<MyEntity> {
  constructor(protected repository: MyEntityRepository) {
    super(repository);
  }

  async myCustomMethod(id: string) {
    return this.repository.findById(id);
  }
}
```

## Controller Rules

- Use arrow functions.
- Keep one `try/catch` per handler.
- Extract params/body, call the service, and format the response.
- No business logic, SQL, repository wiring, or direct env parsing in controllers.
- Use `error instanceof Error ? error.message : "Error desconocido"` for error extraction.

## Routes Rules

- Authenticate before protected handlers.
- Validate POST/PUT/PATCH bodies with Zod plus `validate()` middleware.
- Use thin route wrappers.
- Do not read `process.env` in routes.

## Persistence Rules

- Prefer `SupabaseRepository<T>` for standard CRUD modules.
- Use SQL helpers only when repository primitives are not enough.
- Push filtering/pagination to SQL instead of loading broad datasets and filtering in memory.

## Checklist

- [ ] Module follows model -> repository -> service -> controller -> routes
- [ ] Repository uses `SupabaseRepository<T>` or an approved SQL helper pattern
- [ ] Service owns business logic
- [ ] Controller stays HTTP-only
- [ ] Routes apply auth and validation in the correct order
- [ ] Env access uses `getEnv()` outside env/bootstrap config files
