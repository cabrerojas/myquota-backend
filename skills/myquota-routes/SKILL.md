---
name: myquota-routes
description: >
  Patrones de routes: DI por request con res.locals, authenticate middleware, thin wrappers.
  Trigger: Cuando se crean rutas, se configura autenticación, o se necesita inyección de dependencias.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Creating routes"
    - "Configuring authentication"
    - "Setting up dependency injection"
    - "Adding request validation"
    - "Creating Zod schemas"
---

## Propósito

Crear routers en MyQuota usando el patrón de DI por request con `res.locals`. Este patrón es necesario porque los repositorios necesitan `userId` del JWT (conocido solo en runtime).

---

## Patrón Base

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { MyEntityController } from "./myEntity.controller";
import { MyEntityRepository } from "./myEntity.repository";
import { MyEntityService } from "./myEntity.service";
import { authenticate } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validate.middleware";
import { createMyEntitySchema, updateMyEntitySchema } from "./myEntity.schemas";

const createMyEntityRouter = (): Router => {
  const router = Router();

  // Middleware: authenticate + DI por request
  router.use(
    "/myEntities",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(400).json({ message: "userId es requerido." });
        return;
      }

      try {
        const repository = new MyEntityRepository(userId);
        const service = new MyEntityService(repository);
        const controller = new MyEntityController(service);
        res.locals.myEntityController = controller;
        next();
      } catch (error) {
        console.error("Error en middleware:", error);
        res.status(500).json({ message: "Error interno." });
      }
    },
  );

  // Routes — thin wrappers
  router.get("/myEntities", (req: Request, res: Response) => {
    return res.locals.myEntityController.getAll(req, res);
  });

  router.post("/myEntities", validate(createMyEntitySchema), (req: Request, res: Response) => {
    return res.locals.myEntityController.create(req, res);
  });

  router.get("/myEntities/:itemId", (req: Request, res: Response) => {
    return res.locals.myEntityController.getById(req, res);
  });

  router.put("/myEntities/:itemId", validate(updateMyEntitySchema), (req: Request, res: Response) => {
    return res.locals.myEntityController.update(req, res);
  });

  router.delete("/myEntities/:itemId", (req: Request, res: Response) => {
    return res.locals.myEntityController.delete(req, res);
  });

  return router;
};

export default createMyEntityRouter;
```

---

## Reglas de Routes

### 1. Export default createXRouter

```typescript
// ✅ CORRECTO
const createMyEntityRouter = (): Router => { ... };
export default createMyEntityRouter;

// ❌ INCORRECTO — no export default
export const myEntityRouter = Router();
```

### 2. authenticate SIEMPRE primero

```typescript
router.use(
  "/myEntities",
  authenticate,  // ← Primero
  (req, res, next) => { ... },  // ← DI middleware después
);
```

### 3. DI por request en middleware

```typescript
(req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(400).json({ message: "userId es requerido." });
    return;
  }

  try {
    const repository = new MyEntityRepository(userId);
    const service = new MyEntityService(repository);
    const controller = new MyEntityController(service);
    res.locals.myEntityController = controller;
    next();
  } catch (error) {
    console.error("Error en middleware:", error);
    res.status(500).json({ message: "Error interno." });
  }
};
```

### 4. Handlers son thin wrappers

```typescript
// ✅ CORRECTO — thin wrapper
router.get("/myEntities", (req: Request, res: Response) => {
  return res.locals.myEntityController.getAll(req, res);
});

// ✅ CORRECTO — POST/PUT con validate middleware
router.post("/myEntities", validate(createMyEntitySchema), (req: Request, res: Response) => {
  return res.locals.myEntityController.create(req, res);
});

// ❌ INCORRECTO — lógica en el handler
router.get("/myEntities", async (req, res) => {
  try {
    const items = await service.findAll();
    res.json(items);
  } catch (err) { ... }
});
```

---

## Validación con Zod

Todas las rutas POST/PUT deben usar `validate()` middleware que valida `req.body` contra un Zod schema antes de llegar al controller.

### Definir schemas

```typescript
// src/modules/<moduleName>/<moduleName>.schemas.ts
import { z } from "zod";

export const createMyEntitySchema = z
  .object({
    name: z.string().min(1),
    amount: z.number().min(0),
  })
  .strict();

export const updateMyEntitySchema = createMyEntitySchema.partial();
```

### Usar en rutas

```typescript
import { validate } from "@shared/middlewares/validate.middleware";
import { createMyEntitySchema, updateMyEntitySchema } from "./myEntity.schemas";

router.post("/myEntities", validate(createMyEntitySchema), (req, res) => {
  return res.locals.myEntityController.create(req, res);
});

router.put("/myEntities/:id", validate(updateMyEntitySchema), (req, res) => {
  return res.locals.myEntityController.update(req, res);
});
```

### Reglas de schemas

- Usar `.strict()` para rechazar campos extra
- Schema de update es `.partial()` del create
- Fechas: `z.string().or(z.coerce.date())`
- Un archivo por módulo: `<moduleName>.schemas.ts`
```

---

## Rutas Anidadas

Para rutas como `/creditCards/:creditCardId/transactions`:

```typescript
const createTransactionRouter = (): Router => {
  const router = Router();

  router.use(
    "/creditCards/:creditCardId/transactions",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;
      const { creditCardId } = req.params;

      if (!userId || !creditCardId) {
        res.status(400).json({ message: "userId y creditCardId requeridos." });
        return;
      }

      try {
        const repository = new TransactionRepository(userId, creditCardId);
        const service = new TransactionService(repository);
        const controller = new TransactionController(service);
        res.locals.transactionController = controller;
        next();
      } catch (error) {
        console.error("Error en middleware:", error);
        res.status(500).json({ message: "Error interno." });
      }
    },
  );

  router.get("/creditCards/:creditCardId/transactions", (req, res) => {
    return res.locals.transactionController.getAll(req, res);
  });

  // ... más rutas

  return router;
};
```

---

## Rutas Públicas (sin auth)

Para rutas como `/login`, `/register`:

```typescript
const createAuthRouter = (): Router => {
  const router = Router();

  // Sin authenticate middleware
  const userRepository = new UserRepository();
  const authService = new AuthService(userRepository);
  const authController = new AuthController(authService);

  router.post("/login/google", (req, res) => {
    return authController.loginWithGoogle(req, res);
  });

  router.post("/refresh", (req, res) => {
    return authController.refreshToken(req, res);
  });

  return router;
};

export default createAuthRouter;
```

---

## Montaje en index.ts

```typescript
// src/index.ts
import createMyEntityRouter from "@modules/myEntity/myEntity.routes";

app.use("/api", createMyEntityRouter());
app.use("/api", createTransactionRouter());
// ... más routers

app.use(errorHandler); // Siempre al final
```

---

## Anti-patterns

```typescript
// ❌ Export named en lugar de default
export const router = Router();

// ❌ authenticate después del middleware de DI
router.use("/...", diMiddleware, authenticate);

// ❌ Lógica en el handler
router.get("/items", async (req, res) => {
  const items = await service.findAll(); // NO
});

// ❌ DI fuera del middleware (no tiene userId)
const repository = new MyEntityRepository(/* ? */);
const service = new MyEntityService(repository);
```

---

## Checklist

- [ ] Export default `createXRouter`
- [ ] `authenticate` es el primer middleware (rutas protegidas)
- [ ] Middleware de DI valida userId antes de instanciar
- [ ] Controller guardado en `res.locals`
- [ ] Handlers son thin wrappers: `(req, res) => res.locals.controller.method(req, res)`
- [ ] POST/PUT usan `validate(zodSchema)` middleware
- [ ] Zod schemas definidos en `<module>.schemas.ts` con `.strict()`
- [ ] Router montado en `index.ts` con `app.use("/api", ...)`
- [ ] Rutas anidadas validan todos los IDs necesarios
- [ ] Variables de entorno via `getEnv()`, nunca `process.env`
