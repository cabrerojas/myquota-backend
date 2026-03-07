# MyQuota Backend — AI Agent Guidelines

Guía para agentes de IA que trabajan en `myquota-backend`. Para patrones detallados, invoca el skill correspondiente.

---

## How to Use This Guide

- Start here for project-wide norms (arquitectura, convenciones, TypeScript).
- For detailed patterns, invoke the skill listed in the tables below.
- Each skill contains templates, examples, and checklists específicos.

---

## Available Skills

### MyQuota-Specific Skills

| Skill                | Descripción                                          | URL                                            |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `myquota-module`     | Crear módulos completos (model→routes) con templates | [SKILL.md](skills/myquota-module/SKILL.md)     |
| `myquota-repository` | FirestoreRepository patterns, paths, subcolecciones  | [SKILL.md](skills/myquota-repository/SKILL.md) |
| `myquota-service`    | BaseService patterns, inyección de dependencias      | [SKILL.md](skills/myquota-service/SKILL.md)    |
| `myquota-controller` | Controllers con arrow functions y try/catch          | [SKILL.md](skills/myquota-controller/SKILL.md) |
| `myquota-routes`     | DI por request con res.locals, authenticate          | [SKILL.md](skills/myquota-routes/SKILL.md)     |
| `myquota-auth`       | JWT flow, middleware, type augmentation              | [SKILL.md](skills/myquota-auth/SKILL.md)       |
| `myquota-dates`      | Chile timezone, ISO strings, date.utils              | [SKILL.md](skills/myquota-dates/SKILL.md)      |
| `myquota-cache`      | 3-level cache (L1→L2→L3), vistas materializadas      | [SKILL.md](skills/myquota-cache/SKILL.md)      |
| `sync-types`         | Sincronizar tipos backend→frontend                   | [SKILL.md](skills/sync-types/SKILL.md)         |

### Meta Skills

| Skill        | Descripción                                | URL                                    |
| ------------ | ------------------------------------------ | -------------------------------------- |
| `skill-sync` | Sincroniza Auto-invoke tables en AGENTS.md | [SKILL.md](skills/skill-sync/SKILL.md) |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action                          | Skill                |
| ------------------------------- | -------------------- |
| Creating a new module           | `myquota-module`     |
| Creating a repository           | `myquota-repository` |
| Creating a service              | `myquota-service`    |
| Creating a controller           | `myquota-controller` |
| Adding an endpoint              | `myquota-controller` |
| Handling errors in controllers  | `myquota-controller` |
| Creating routes                 | `myquota-routes`     |
| Configuring authentication      | `myquota-routes`     |
| Setting up dependency injection | `myquota-routes`     |
| Working with JWT auth           | `myquota-auth`       |
| Implementing authentication     | `myquota-auth`       |
| Handling refresh tokens         | `myquota-auth`       |
| Working with dates              | `myquota-dates`      |
| Handling Chile timezone         | `myquota-dates`      |
| Serializing timestamps          | `myquota-dates`      |
| Implementing caching            | `myquota-cache`      |
| Creating materialized views     | `myquota-cache`      |
| Optimizing expensive reads      | `myquota-cache`      |
| Modifying backend models        | `sync-types`         |
| Syncing types with frontend     | `sync-types`         |
| Adding fields to entities       | `sync-types`         |

## <!-- Skills extracted from metadata.auto_invoke in each SKILL.md -->

## Tech Stack (Quick Reference)

| Dato     | Valor                                   |
| -------- | --------------------------------------- |
| Runtime  | Node 22 + Express 4                     |
| Language | TypeScript 5.6 (strict)                 |
| Database | Firestore (firebase-admin)              |
| Auth     | Google Sign-In → JWT (access + refresh) |
| Linting  | ESLint 9 (flat config)                  |
| Deploy   | Render                                  |

**Entry point**: `src/index.ts` — mounts routers + errorHandler

---

## Project Structure

```
src/
├── index.ts                    # Express app, mounts routers
├── config/                     # Firebase, Gmail OAuth
├── modules/                    # Feature-based modules
│   └── <module>/
│       ├── <module>.model.ts
│       ├── <module>.repository.ts
│       ├── <module>.service.ts
│       ├── <module>.controller.ts
│       └── <module>.routes.ts
└── shared/                     # Shared code
    ├── classes/                # BaseService, FirestoreRepository
    ├── interfaces/             # IBaseEntity, IBaseRepository
    ├── middlewares/            # authenticate, errorHandler
    ├── errors/                 # RepositoryError, AuthError
    └── utils/                  # date.utils, array.utils
```

---

## Critical Rules (ALWAYS / NEVER)

### ALWAYS

1. **IBaseEntity** para entidades: `id`, `createdAt`, `updatedAt`, `deletedAt`
2. **FirestoreRepository<T>** para repositorios
3. **BaseService<T>** para servicios con CRUD
4. **Imports con aliases**: `@/`, `@shared/`, `@modules/`, `@config/`
5. **camelCase** para campos de entidad
6. **Arrow functions** en controllers
7. **try/catch** en cada método de controller
8. **`error instanceof Error ? error.message : "Error desconocido"`** para extraer mensajes

### NEVER

1. **`any`** — usar `unknown` + type guard
2. **snake_case** en campos de entidad
3. **Lógica de negocio** en controllers
4. **Rutas relativas** (`../../`) fuera del módulo
5. **`console.log`** en código nuevo — solo `console.error` en catches
6. **Pasar objeto `error` raw** a `res.json()` — siempre extraer `.message`

---

## Naming Conventions

| Tipo               | Convención      | Ejemplo                     |
| ------------------ | --------------- | --------------------------- |
| Archivos de módulo | camelCase       | `billingPeriod.model.ts`    |
| Clases/Entidades   | PascalCase      | `BillingPeriod`             |
| Interfaces         | `I` prefix      | `IBaseEntity`               |
| Variables locales  | camelCase       | `const billingPeriods`      |
| Constantes         | UPPER_SNAKE     | `CHILE_TZ`                  |
| Router factory     | `createXRouter` | `createBillingPeriodRouter` |
| Params no usados   | `_` prefix      | `_req`, `_next`             |

---

## Import Order

```typescript
// 1. Node / third-party
import { Router, Request, Response } from "express";

// 2. Shared (aliases)
import { BaseService } from "@shared/classes/base.service";

// 3. Other modules
import { TransactionRepository } from "@modules/transaction/transaction.repository";

// 4. Local (same module)
import { BillingPeriod } from "./billingPeriod.model";
```

---

## HTTP Response Codes

| Operación | Éxito | Not Found | Client Error | Server Error |
| --------- | ----- | --------- | ------------ | ------------ |
| GET list  | 200   | —         | 400          | 500          |
| GET by ID | 200   | 404       | 400          | 500          |
| POST      | 201   | —         | 400          | 500          |
| PUT       | 200   | 404       | 400          | 500          |
| DELETE    | 200   | 404       | —            | 500          |

---

## Commands

```bash
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Run compiled code
npm run lint     # ESLint check
```

---

## Environment Variables

| Variable              | Propósito                  | Required   |
| --------------------- | -------------------------- | ---------- |
| `SERVICE_ACCOUNT_KEY` | Firebase SA (base64)       | Yes (prod) |
| `FIREBASE_DB_URL`     | Firestore URL              | Yes        |
| `JWT_SECRET`          | JWT signing                | Yes        |
| `JWT_REFRESH_SECRET`  | Refresh token signing      | Yes        |
| `PORT`                | Server port (default 3000) | No         |

---

## QA Checklist

Before delivering code:

- [ ] Module follows pattern: model → repository → service → controller → routes
- [ ] Entity implements `IBaseEntity`
- [ ] Repository extends `FirestoreRepository<T>` and manages ONLY its collection
- [ ] Service extends `BaseService<T>` and receives repository via constructor
- [ ] Controller uses arrow functions with try/catch in each method
- [ ] Errors use `error instanceof Error ? error.message : "Error desconocido"`
- [ ] Variables are camelCase
- [ ] Routes use `res.locals` pattern with `authenticate`
- [ ] `createXRouter` is mounted in `index.ts`
- [ ] No `any` introduced
- [ ] Imports use aliases `@/`, `@shared/`, `@modules/`
- [ ] `npm run lint` passes
- [ ] Entity fields are camelCase
- [ ] No unnecessary `console.log` (only `console.error` in catches)

---

## Technical Debt (DO NOT ADD MORE)

Existing issues to resolve progressively:

1. `TransactionService` too large (~740 lines) — extract to specialized services
2. Repository boundary violations — repos accessing other collections
3. `stats` module incomplete — empty repository, unused interfaces
4. `UserService` constructor bug — ignores injected repository
5. `MerchantPattern` doesn't follow pattern — no IBaseEntity
6. snake_case in `Quota` model — `due_date`, `payment_date`
7. Excessive console.log with emojis
8. `errorHandler` debug leftovers
9. `@Collection` decorator unused
10. No `req.body` validation — future: add Zod
11. No tests
12. Environment variables without validation
13. Currency inconsistency — "Dolar" vs "CLP"

---

## Key Files

| File                                         | Purpose                      |
| -------------------------------------------- | ---------------------------- |
| `src/index.ts`                               | Express app, router mounting |
| `src/config/firebase.ts`                     | Firebase init, exports `db`  |
| `src/shared/classes/firestore.repository.ts` | Generic Firestore CRUD       |
| `src/shared/classes/base.service.ts`         | Generic service CRUD         |
| `src/shared/middlewares/auth.middleware.ts`  | JWT authentication           |
| `src/shared/errors/custom.error.ts`          | RepositoryError, AuthError   |
| `src/shared/utils/date.utils.ts`             | Chile timezone utilities     |

---

## Git Workflow

### ALWAYS

1. **Crear rama** para cada desarrollo — NUNCA commitear directo a `main`
2. **Branch naming**: `feat/<nombre>`, `fix/<nombre>`, `refactor/<nombre>`, `chore/<nombre>`
3. **Crear PR** con `gh pr create` al terminar el desarrollo
4. **Commits descriptivos** con prefijo: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`

### NEVER

1. **Push directo a `main`** — siempre via PR
2. **`git push --force`** sin confirmación explícita del usuario
3. **Mezclar scopes** en un PR — un PR = un tema

### Flujo

```bash
git checkout -b feat/mi-feature     # 1. Crear rama
# ... hacer cambios ...
git add <archivos>                  # 2. Stage cambios relevantes
git commit -m "feat: descripción"   # 3. Commit descriptivo
git push -u origin feat/mi-feature  # 4. Push rama
gh pr create --base main            # 5. Crear PR
```
