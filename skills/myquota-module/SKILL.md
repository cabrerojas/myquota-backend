---
name: myquota-module
description: >
  Crear módulos completos siguiendo el patrón model→repository→service→controller→routes.
  Trigger: Cuando se crea un nuevo módulo, se agrega una nueva entidad, o se necesita el template completo.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Creating a new module"
    - "Adding a new entity"
    - "Generating module boilerplate"
---

## Propósito

Crear módulos completos en MyQuota Backend siguiendo la arquitectura establecida. Cada módulo tiene 5 archivos obligatorios que siguen patrones específicos.

---

## Estructura de un Módulo

```
src/modules/<moduleName>/
├── <moduleName>.model.ts        # Entidad con IBaseEntity
├── <moduleName>.schemas.ts      # Zod schemas para validar req.body
├── <moduleName>.repository.ts   # Extiende FirestoreRepository<T>
├── <moduleName>.service.ts      # Extiende BaseService<T>
├── <moduleName>.controller.ts   # Arrow functions con try/catch
└── <moduleName>.routes.ts       # createXRouter() con res.locals DI
```

**Excepciones**:

- Módulos de solo lectura (como `stats`) pueden omitir model, repository y schemas
- Sub-módulos sin rutas propias pueden omitir controller y routes
- Módulos complejos pueden tener sub-servicios adicionales (e.g., `emailImport.service.ts`)

---

## Template: Model

```typescript
// src/modules/<moduleName>/<moduleName>.model.ts
import { IBaseEntity } from "@shared/interfaces/base.repository";

export class MyEntity implements IBaseEntity {
  id!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;

  // Domain fields (camelCase ONLY)
  name!: string;
  amount!: number;
  isActive!: boolean;
  userId!: string;
  // Optional fields use ?:
  description?: string;
}
```

### Reglas de Model

- Usar `class` (no `interface`) — permite `instanceof`
- Campos obligatorios: `!:` (definite assignment)
- Campos opcionales: `?:`
- **camelCase** para TODOS los campos. NUNCA snake_case.
- `deletedAt` siempre es `Date | null`

---

## Template: Repository

```typescript
// src/modules/<moduleName>/<moduleName>.repository.ts
import { FirestoreRepository } from "@shared/classes/firestore.repository";
import { MyEntity } from "./<moduleName>.model";

export class MyEntityRepository extends FirestoreRepository<MyEntity> {
  constructor(userId: string) {
    // Path: pares [collection, docId, ...] hacia el documento padre
    // CollectionName: nombre de la colección final
    super(["users", userId], "myEntities");
  }

  // Métodos custom opcionales
  async findByStatus(status: string): Promise<MyEntity[]> {
    const results = await this.findAll({ status } as Partial<MyEntity>);
    return results;
  }
}
```

### Reglas de Repository

- SIEMPRE extender `FirestoreRepository<T>`
- Constructor recibe IDs dinámicos (userId, etc.)
- Un repo gestiona SOLO su colección
- Para datos de otra colección, usar otro repository en el service

---

## Template: Service

```typescript
// src/modules/<moduleName>/<moduleName>.service.ts
import { BaseService } from "@shared/classes/base.service";
import { MyEntity } from "./<moduleName>.model";
import { MyEntityRepository } from "./<moduleName>.repository";

export class MyEntityService extends BaseService<MyEntity> {
  protected repository: MyEntityRepository;

  constructor(repository: MyEntityRepository) {
    super(repository);
    this.repository = repository;
  }

  // Business logic methods
  async myCustomMethod(entityId: string): Promise<MyEntity | null> {
    const entity = await this.repository.findById(entityId);
    // Business logic here
    return entity;
  }
}
```

### Reglas de Service

- SIEMPRE extender `BaseService<T>`
- Constructor recibe repository (no instanciarlo internamente)
- Declarar `protected repository: SpecificRepository` para métodos custom
- Lógica de negocio vive aquí, NO en controller

---

## Template: Controller

```typescript
// src/modules/<moduleName>/<moduleName>.controller.ts
import { Request, Response } from "express";
import { MyEntityService } from "./<moduleName>.service";

export class MyEntityController {
  constructor(private readonly service: MyEntityService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const items = await this.service.findAll();
      res.status(200).json(items);
    } catch (error) {
      console.error("Error getting items:", error);
      res.status(500).json({
        message: "Error al obtener items",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { itemId } = req.params;
      const item = await this.service.findById(itemId);

      if (!item) {
        res.status(404).json({ message: "Item no encontrado" });
        return;
      }

      res.status(200).json(item);
    } catch (error) {
      console.error("Error getting item:", error);
      res.status(500).json({
        message: "Error al obtener el item",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const item = await this.service.create(req.body);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating item:", error);
      res.status(500).json({
        message: "Error al crear item",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { itemId } = req.params;
      const updated = await this.service.update(itemId, req.body);

      if (!updated) {
        res.status(404).json({ message: "Item no encontrado" });
        return;
      }

      res.status(200).json({
        message: "Item actualizado exitosamente",
        data: updated,
      });
    } catch (error) {
      console.error("Error updating item:", error);
      res.status(500).json({
        message: "Error al actualizar item",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const { itemId } = req.params;
      const deleted = await this.service.softDelete(itemId);

      if (!deleted) {
        res.status(404).json({ message: "Item no encontrado" });
        return;
      }

      res.status(200).json({ message: "Item eliminado exitosamente" });
    } catch (error) {
      console.error("Error deleting item:", error);
      res.status(500).json({
        message: "Error al eliminar item",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };
}
```

### Reglas de Controller

- Métodos como **arrow functions** (`= async () =>`)
- Params no usados: prefijo `_` (`_req`, `_res`)
- SIEMPRE try/catch en cada método
- Extraer mensaje: `error instanceof Error ? error.message : "Error desconocido"`
- NO lógica de negocio — solo extrae params, llama service, formatea respuesta

---

## Template: Schemas (Zod)

```typescript
// src/modules/<moduleName>/<moduleName>.schemas.ts
import { z } from "zod";

export const createMyEntitySchema = z
  .object({
    name: z.string().min(1),
    amount: z.number().min(0),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateMyEntitySchema = createMyEntitySchema.partial();
```

### Reglas de Schemas

- Usar `.strict()` para rechazar campos extra
- Schema de update es `.partial()` del create
- Fechas: `z.string().or(z.coerce.date())` para aceptar ISO strings o Date
- Un archivo por módulo: `<moduleName>.schemas.ts`

---

## Template: Routes

```typescript
// src/modules/<moduleName>/<moduleName>.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { MyEntityController } from "./<moduleName>.controller";
import { MyEntityRepository } from "./<moduleName>.repository";
import { MyEntityService } from "./<moduleName>.service";
import { authenticate } from "@shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validate.middleware";
import { createMyEntitySchema, updateMyEntitySchema } from "./<moduleName>.schemas";

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
        console.error("Error en middleware de MyEntity:", error);
        res.status(500).json({ message: "Error interno." });
      }
    },
  );

  // Routes
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

### Reglas de Routes

- Exportar `createXRouter` como `export default`
- DI por request: instanciar repo→service→controller en middleware
- `authenticate` SIEMPRE primero (excepto rutas públicas)
- Handlers son thin wrappers: `(req, res) => res.locals.controller.method(req, res)`
- POST/PUT usan `validate(zodSchema)` middleware antes del handler

---

## Montaje en index.ts

Después de crear el router, agregarlo en `src/index.ts`:

```typescript
import createMyEntityRouter from "@modules/myEntity/myEntity.routes";

// ... existing code ...

app.use("/api", createMyEntityRouter());

// errorHandler siempre al final
app.use(errorHandler);
```

---

## Checklist de Módulo Completo

- [ ] `model.ts` creado con `implements IBaseEntity`
- [ ] `schemas.ts` creado con Zod schemas (`.strict()`)
- [ ] `repository.ts` extiende `FirestoreRepository<T>`
- [ ] `service.ts` extiende `BaseService<T>` y recibe repo por constructor
- [ ] `controller.ts` usa arrow functions con try/catch
- [ ] `routes.ts` usa patrón `res.locals` con `authenticate`
- [ ] POST/PUT usan `validate(zodSchema)` middleware
- [ ] Router montado en `index.ts`
- [ ] Imports usan aliases `@shared/`, `@modules/`
- [ ] Campos de entidad en camelCase
- [ ] Variables de entorno via `getEnv()`, nunca `process.env`
- [ ] `npm run lint` pasa
