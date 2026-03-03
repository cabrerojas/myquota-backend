# Instrucciones para agentes (Copilot) — MyQuota Backend

Guía **prescriptiva** para cualquier agente de IA que trabaje en `myquota-backend`.
Objetivo: que el proyecto crezca de forma coherente sin importar qué modelo o agente genere código.

---

## 1. Visión general del proyecto

| Dato          | Valor                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Stack         | Node 22 + Express 4 + TypeScript 5.6 (strict)                               |
| Base de datos | Firestore (vía `firebase-admin`)                                            |
| Auth          | Google Sign-In → JWT (access + refresh tokens)                              |
| Arquitectura  | Modular (feature-based): model → repository → service → controller → routes |
| Estilos       | ESLint 9 (`eslint.config.mjs`) + TypeScript strict                          |
| Tests         | No configurados aún (meta futura)                                           |
| Deploy        | Render (`https://myquota-backend.onrender.com`)                             |

**Punto de entrada**: [src/index.ts](src/index.ts) — monta routers por módulo y el middleware de errores.

---

## 2. Arquitectura de carpetas

```
src/
├── index.ts                         # Express app, monta routers + errorHandler
├── config/
│   ├── firebase.ts                  # Inicializa firebase-admin y exporta `db`
│   ├── gmailAuth.ts                 # OAuth2 para importación de emails bancarios
│   ├── credentials.json             # Gmail OAuth (NO versionar en prod)
│   └── serviceAccountKey.json       # Firebase SA (NO versionar, usar env)
│
├── modules/                         # Un folder por feature de negocio
│   └── <module>/
│       ├── <module>.model.ts        # Clase entidad implements IBaseEntity
│       ├── <module>.repository.ts   # extends FirestoreRepository<T>
│       ├── <module>.service.ts      # extends BaseService<T>
│       ├── <module>.controller.ts   # Métodos arrow function con try/catch
│       └── <module>.routes.ts       # createXRouter() con res.locals DI
│
└── shared/                          # Código compartido entre módulos
    ├── classes/
    │   ├── base.service.ts          # BaseService<T> — CRUD genérico
    │   └── firestore.repository.ts  # FirestoreRepository<T> — CRUD Firestore
    ├── interfaces/
    │   ├── base.repository.ts       # IBaseEntity, IBaseRepository<T>
    │   └── base.service.ts          # IBaseService<T>
    ├── middlewares/
    │   ├── auth.middleware.ts        # authenticate — JWT validation
    │   └── errorHandler.ts          # Error handler global de Express
    ├── errors/
    │   └── custom.error.ts          # RepositoryError, AuthError
    ├── decorators/
    │   └── collection.decorator.ts  # @Collection (legacy, no usar)
    └── utils/
        ├── date.utils.ts            # parseFirebaseDate, convertUtcToChileTime, toChileStartOfDay, toChileEndOfDay
        └── array.utils.ts           # chunkArray
```

### Reglas de arquitectura (OBLIGATORIAS)

1. **Todo módulo nuevo DEBE tener como mínimo**: `model.ts` + `repository.ts` + `service.ts` + `controller.ts` + `routes.ts`.

2. **Excepciones permitidas**: módulos puramente de lectura/cálculo (como `stats`) pueden omitir `model.ts` y `repository.ts` si no tienen una entidad CRUD propia. En ese caso, documental el porqué con un comentario al inicio del service.

3. **Sub-módulos** (como `category/merchant/`): si una entidad es hija de otra y no tiene rutas propias, puede existir como sub-carpeta con `model.ts` + `repository.ts` + `service.ts`, sin controller ni routes. El controller padre lo consume.

4. **Imports**: usar siempre los alias `@/`, `@shared/`, `@modules/`, `@config/` definidos en `tsconfig.json`. NUNCA usar rutas relativas con `../../` fuera del propio módulo. Dentro del módulo (mismo folder), usar rutas relativas con `./`.

   ```typescript
   // ✅ Correcto — import desde otro módulo o shared
   import { BaseService } from "@shared/classes/base.service";
   import { TransactionRepository } from "@modules/transaction/transaction.repository";

   // ✅ Correcto — import dentro del mismo módulo
   import { BillingPeriod } from "./billingPeriod.model";

   // ❌ Incorrecto
   import { BaseService } from "../../shared/classes/base.service";
   ```

5. **Cada router se monta en `index.ts`** con `app.use("/api", createXRouter())`. El router define internamente sus sub-paths (e.g., `/creditCards`, `/creditCards/:creditCardId/transactions`).

---

## 3. Entidades (Model)

### Patrón obligatorio

Toda entidad CRUD debe implementar `IBaseEntity`:

```typescript
import { IBaseEntity } from "@shared/interfaces/base.repository";

export class MyEntity implements IBaseEntity {
  id!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;

  // Campos del dominio
  name!: string;
  amount!: number;
}
```

### Reglas de modelo

- Usar `class` (no `interface`) para las entidades — permite `instanceof` y es compatible con los genéricos de `FirestoreRepository`.
- Todos los campos obligatorios usan `!:` (definite assignment assertion) — los valores se asignan en el repositorio, no en el constructor.
- **camelCase** para todos los nombres de campo. NUNCA snake_case.
- Campos opcionales usan `?:` con su tipo.
- `deletedAt` siempre es `Date | null` (null = no eliminado, Date = soft-deleted).

### Entidades actuales y su ubicación en Firestore

| Entidad           | Path en Firestore                                                        |
| ----------------- | ------------------------------------------------------------------------ |
| `User`            | `users/{userId}`                                                         |
| `CreditCard`      | `users/{userId}/creditCards/{creditCardId}`                              |
| `Transaction`     | `users/{userId}/creditCards/{creditCardId}/transactions/{transactionId}` |
| `Quota`           | `.../transactions/{transactionId}/quotas/{quotaId}`                      |
| `BillingPeriod`   | `users/{userId}/creditCards/{creditCardId}/billingPeriods/{id}`          |
| `Category`        | `users/{userId}/categories/{id}` o `categories/{id}` (globales)          |
| `MerchantPattern` | `categories/{categoryId}/merchants/{id}`                                 |

---

## 4. Repositorios (Repository)

### Patrón obligatorio

```typescript
import { FirestoreRepository } from "@shared/classes/firestore.repository";
import { MyEntity } from "./myEntity.model";

export class MyEntityRepository extends FirestoreRepository<MyEntity> {
  constructor(userId: string) {
    // path: pares [collection, docId, ...] que forman la ruta al documento padre
    // collectionName: nombre de la colección final bajo ese documento
    super(["users", userId], "myEntities");
  }

  // Métodos adicionales específicos del módulo (opcionales)
}
```

### Reglas de repositorio

- **Siempre extender `FirestoreRepository<T>`**. Si un caso especial lo impide, documentar extensamente el motivo.
- El constructor recibe los IDs dinámicos necesarios para construir el path de Firestore.
- `super(path, collectionName)` — `path` es un array de strings alternando `[collection, docId, collection, docId, ...]`. `collectionName` es la colección final.
- Para colecciones raíz (como `users`): `super([], "users")`.
- **Cada repositorio gestiona SOLO su propia colección**. NO acceder a sub-colecciones de otra entidad directamente desde un repositorio.
- Si necesitas datos de otra colección, crea/usa el repositorio correspondiente en el service.
- Métodos custom del repositorio que sobrescriben los del base deben llamar a `this.sanitizeTimestamps()` al leer y `this.datesToIsoStrings()` al escribir.

### FirestoreRepository base — métodos disponibles

| Método       | Firma                                                  | Descripción                                                               |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `create`     | `(data: Omit<T, keyof IBaseEntity>) => Promise<T>`     | Crea con `id`, `createdAt`, `updatedAt`, `deletedAt: null` auto-generados |
| `findAll`    | `(filters?: Partial<T>) => Promise<T[]>`               | Busca todos (excluye soft-deleted). Acepta filtros `where field == value` |
| `findById`   | `(id: string) => Promise<T \| null>`                   | Busca por ID. Retorna `null` si no existe o está soft-deleted             |
| `findOne`    | `(filters: Partial<T>) => Promise<T \| null>`          | Busca el primero que coincida con los filtros                             |
| `update`     | `(id: string, data: Partial<T>) => Promise<T \| null>` | Actualiza y asigna `updatedAt` automáticamente                            |
| `delete`     | `(id: string) => Promise<boolean>`                     | Eliminación física                                                        |
| `softDelete` | `(id: string) => Promise<boolean>`                     | Asigna `deletedAt = new Date()`                                           |

---

## 5. Servicios (Service)

### Patrón obligatorio

```typescript
import { BaseService } from "@shared/classes/base.service";
import { IBaseEntity } from "@shared/interfaces/base.repository";
import { MyEntity } from "./myEntity.model";
import { MyEntityRepository } from "./myEntity.repository";

export class MyEntityService extends BaseService<MyEntity> {
  protected repository: MyEntityRepository;

  constructor(repository: MyEntityRepository) {
    super(repository);
    this.repository = repository;
  }

  // Métodos de negocio adicionales
  async myCustomMethod(entityId: string): Promise<MyEntity | null> {
    // Lógica de negocio aquí
    return this.repository.findById(entityId);
  }
}
```

### Reglas de servicio

- **Siempre extender `BaseService<T>`** (salvo servicios que no tienen entidad CRUD propia, como `AuthService` o `StatsService`).
- Declarar `protected repository: SpecificRepository` para acceder a métodos custom del repo (el tipo base solo expone `IBaseRepository`).
- **El constructor recibe el repositorio como parámetro y lo pasa a `super()`**. NUNCA instanciar el repositorio dentro del constructor del servicio — la instanciación ocurre en el routes.
- La lógica de negocio vive en el servicio, NO en el controller ni en el repository.
- Validaciones de datos de entrada (campos obligatorios, formatos) van en el servicio.
- Si un servicio necesita datos de otro módulo, inyectar el repositorio o servicio correspondiente como parámetro adicional del constructor.
- **`req.body` NO debe llegar directo al service sin pasar por el controller** — el controller extrae y valida los datos antes de pasarlos.

### BaseService — métodos heredados

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

## 6. Controladores (Controller)

### Patrón obligatorio

```typescript
import { Request, Response } from "express";
import { MyEntityService } from "./myEntity.service";

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

### Reglas de controller

- Métodos como **arrow functions** (`método = async (req, res) =>`) para evitar problemas con `this`.
- Parámetros sin usar se nombran con `_` prefijo: `_req`, `_res`.
- **SIEMPRE** try/catch en cada método. El catch:
  1. Hace `console.error` con contexto descriptivo.
  2. Responde con `res.status(500).json({ message, error })`.
  3. Extrae el mensaje con `error instanceof Error ? error.message : "Error desconocido"`. **NUNCA** pasar el objeto `error` raw a la respuesta JSON.
- **Variables locales en camelCase**: `const billingPeriods = ...` (NO `BillingPeriods`).
- El controller NO contiene lógica de negocio — solo extrae params/body, llama al service, y formatea la respuesta.
- Para endpoints que retornan un objeto mutado (update), usar formato `{ message: string, data: T }`.
- Para endpoints que retornan una lista, devolver directamente el array.
- Para operaciones exitosas de tipo batch, retornar `{ message: string }`.

### Códigos de respuesta estándar

| Operación        | Éxito | No encontrado | Error del cliente | Error del servidor |
| ---------------- | ----- | ------------- | ----------------- | ------------------ |
| GET (lista)      | 200   | —             | 400               | 500                |
| GET (por ID)     | 200   | 404           | 400               | 500                |
| POST (crear)     | 201   | —             | 400               | 500                |
| PUT (actualizar) | 200   | 404           | 400               | 500                |
| DELETE           | 200   | 404           | —                 | 500                |

---

## 7. Rutas (Routes)

### Patrón obligatorio — DI por request con `res.locals`

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { MyEntityController } from "./myEntity.controller";
import { MyEntityRepository } from "./myEntity.repository";
import { MyEntityService } from "./myEntity.service";
import { authenticate } from "@shared/middlewares/auth.middleware";

const createMyEntityRouter = (): Router => {
  const router = Router();

  // Middleware: authenticate + instanciar DI por request
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
        res.status(500).json({ message: "Error interno en MyEntity." });
      }
    },
  );

  // Rutas
  router.get("/myEntities", (req: Request, res: Response) => {
    return res.locals.myEntityController.getAll(req, res);
  });

  router.post("/myEntities", (req: Request, res: Response) => {
    return res.locals.myEntityController.create(req, res);
  });

  router.get("/myEntities/:myEntityId", (req: Request, res: Response) => {
    return res.locals.myEntityController.getById(req, res);
  });

  router.put("/myEntities/:myEntityId", (req: Request, res: Response) => {
    return res.locals.myEntityController.update(req, res);
  });

  router.delete("/myEntities/:myEntityId", (req: Request, res: Response) => {
    return res.locals.myEntityController.delete(req, res);
  });

  return router;
};

export default createMyEntityRouter;
```

### Reglas de routes

- **Exportar `createXRouter` como `export default`**. Se monta en `index.ts` con `app.use("/api", createXRouter())`.
- **DI por request**: el middleware del router instancia repository → service → controller y lo guarda en `res.locals`. Esto es necesario porque los repositorios necesitan `userId` del JWT (conocido solo en runtime).
- **`authenticate` SIEMPRE va primero** en el middleware chain (excepto rutas públicas como login/registro).
- Para rutas anidadas (e.g., `/creditCards/:creditCardId/transactions`), el middleware extrae tanto `userId` del JWT como `creditCardId` de los params. Validar ambos antes de instanciar.
- Las rutas no autenticadas (auth, registro de usuario) crean repository/service/controller estáticamente al inicio del router o sin el middleware `authenticate`.
- **Cada handler de ruta es un thin wrapper**: `(req, res) => res.locals.xController.method(req, res)`.

### Montaje en index.ts

```typescript
// src/index.ts
app.use("/api", createCreditCardRouter());
app.use("/api", createTransactionRouter());
app.use("/api", createQuotaRouter());
// ... etc.
app.use(errorHandler); // siempre al final
```

---

## 8. Shared: clases base e interfaces

### IBaseEntity — contrato de toda entidad

```typescript
// src/shared/interfaces/base.repository.ts
export interface IBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}
```

### IBaseRepository<T> — contrato de todo repositorio

```typescript
export interface IBaseRepository<T extends IBaseEntity> {
  create(data: Omit<T, keyof IBaseEntity>): Promise<T>;
  findAll(filters?: Partial<T>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  findOne(filters: Partial<T>): Promise<T | null>;
  update(
    id: string,
    data: Partial<Omit<T, keyof IBaseEntity>>,
  ): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  softDelete(id: string): Promise<boolean>;
}
```

### FirestoreRepository<T> — implementación Firestore

Provee todas las operaciones CRUD sobre Firestore. Puntos clave:

- Constructor: `(path: string[], collectionName: string)` — el `path` son pares collection/doc alternos; `collectionName` es la colección final.
- `sanitizeTimestamps(data)` — convierte `Timestamp` y `Date` a ISO strings al leer.
- `datesToIsoStrings(data)` — convierte `Date` a ISO strings al escribir. Elimina campos `undefined`.
- Soft delete: asigna `deletedAt = new Date()`. `findAll` y `findById` filtran por `deletedAt == null`.

### BaseService<T> — servicio genérico

Delega todas las operaciones CRUD al repositorio inyectado. Los servicios concretos lo extienden para agregar lógica de negocio.

### Errores custom

```typescript
// src/shared/errors/custom.error.ts
export class RepositoryError extends Error {
  constructor(message: string, public statusCode: number = 500) { ... }
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) { ... }
}
```

Usar estos errores en repositorios y servicios. Lanzar `RepositoryError` para errores de persistencia, `AuthError` para problemas de autenticación/autorización.

---

## 9. Autenticación

### Flujo

1. App envía `idToken` de Google Sign-In → `POST /api/login/google`.
2. Backend verifica `idToken` con Google, busca/crea user en Firestore.
3. Genera `accessToken` (JWT corto) + `refreshToken` (JWT largo).
4. Requests autenticados llevan `Authorization: Bearer <accessToken>`.
5. `authenticate` middleware decodifica JWT y asigna `req.user = { userId }`.
6. Si el token expira → `401 { code: "token_expired" }` → app usa `POST /api/refresh`.

### Middleware `authenticate`

```typescript
// src/shared/middlewares/auth.middleware.ts
// - Extrae token del header Authorization: Bearer <token>
// - Verifica con JWT_SECRET
// - Asigna req.user = { userId }
// - Diferencia TokenExpiredError para que la app pueda hacer refresh
```

### Global type augmentation

```typescript
// En auth.middleware.ts
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string };
    }
  }
}
```

Esto tipifica `req.user?.userId` globalmente. NO crear otras augmentaciones del `Request` sin documentarlas aquí.

---

## 10. Firestore: paths y subcolecciones

### Regla de path

El array `path` del constructor de `FirestoreRepository` representa pares `[collection, docId, collection, docId, ...]` que conducen al documento padre. `collectionName` es la colección final bajo ese documento.

```typescript
// Para: users/{userId}/creditCards/{creditCardId}/transactions
super(["users", userId, "creditCards", creditCardId], "transactions");

// Para: users/{userId}/creditCards (colección bajo un user doc)
super(["users", userId], "creditCards");

// Para colección raíz: users
super([], "users");
```

### Estructura actual de Firestore

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
categories/                          # Categorías globales (sin userId)
├── {categoryId}/
│   └── merchants/
│       └── {merchantId}
```

### Regla de límites de repositorio

**Un repositorio gestiona SOLO su colección** y NO accede a subcolecciones de otras entidades. Si `TransactionService` necesita cuotas, debe usar `QuotaRepository`, no acceder a la subcolección `quotas` directamente desde `TransactionRepository`.

---

## 11. Fechas y serialización

### Zona horaria

El proyecto usa `America/Santiago` como zona horaria de referencia. Las utilidades están en [src/shared/utils/date.utils.ts](src/shared/utils/date.utils.ts).

| Función                                | Propósito                             |
| -------------------------------------- | ------------------------------------- |
| `parseFirebaseDate(str)`               | Parsea `"dd/mm/yyyy hh:mm"` a `Date`  |
| `convertUtcToChileTime(date, format?)` | Convierte UTC a hora Chile formateada |
| `toChileStartOfDay(date)`              | Normaliza a las 00:00:00 hora Chile   |
| `toChileEndOfDay(date)`                | Normaliza a las 23:59:59 hora Chile   |

### Reglas de fechas

- **Al escribir en Firestore**: `datesToIsoStrings()` del repository convierte `Date` a ISO strings. Así evitamos que Firestore los convierta a `Timestamp`.
- **Al leer de Firestore**: `sanitizeTimestamps()` convierte `Timestamp` de Firestore a ISO strings.
- **La API SIEMPRE devuelve fechas como ISO 8601 strings** (`"2025-03-15T00:00:00.000Z"`).
- Para normalizar fechas de períodos de facturación, usar `toChileStartOfDay` / `toChileEndOfDay`.

---

## 12. Manejo de errores

### Por capa

| Capa                        | Cómo manejar                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Repository**              | Lanzar `RepositoryError(message, statusCode)` con contexto. `console.error` con el error original.                                                     |
| **Service**                 | Lanzar `Error(message)` o dejar escalar el `RepositoryError`. Validar inputs y lanzar errores descriptivos.                                            |
| **Controller**              | Try/catch en CADA método. Extraer mensaje con `error instanceof Error ? error.message : "Error desconocido"`. Responder con JSON `{ message, error }`. |
| **Middleware errorHandler** | Catch-all para errores no capturados. Responde 500 con `{ message, error }`.                                                                           |

### Reglas de error

- **NUNCA pasar el objeto `error` raw** al `res.json()`. Siempre extraer `error.message`.
- **NUNCA swallow errors silenciosamente** (catch vacío). Siempre log + re-throw o respuesta de error.
- Para errores del cliente (datos faltantes, formato inválido): `res.status(400).json({ message })`.
- Para entidades no encontradas: `res.status(404).json({ message })`.
- Para errores de auth: `res.status(401).json({ message, code? })`.

---

## 13. Tipado (TypeScript)

### Reglas estrictas

- `tsconfig.json` tiene `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`. NO desactivar ninguna.
- **Prohibido `any`**. Si un paquete externo lo requiere, usar `unknown` + type guard, o agregar `// eslint-disable-next-line @typescript-eslint/no-explicit-any` con un comentario explicando porqué.
- **Tipos de retorno explícitos** en todos los métodos públicos de servicios y controllers.
- Usar `Omit<T, keyof IBaseEntity>` para datos de creación (excluir campos auto-generados).
- Usar `Partial<Omit<T, keyof IBaseEntity>>` para datos de actualización.

### Path aliases disponibles

```json
{
  "@/*": "src/*",
  "@shared/*": "src/shared/*",
  "@modules/*": "src/modules/*",
  "@config/*": "src/config/*",
  "@infrastructure/*": "src/infrastructure/*"
}
```

---

## 14. ESLint y calidad de código

### Config: [eslint.config.mjs](eslint.config.mjs)

Configuración actual usa ESLint 9 flat config con `typescript-eslint`.

### Reglas que el agente DEBE respetar

- **No `any`** — usar tipos concretos o `unknown`.
- **Return types explícitos** en métodos públicos de services/controllers.
- **No variables sin usar** — eliminarlas o prefixear con `_`.
- **No console.log en código nuevo** — usar `console.error` solo en catches de controllers/repos. Evitar emojis en logs de producción.
- Ejecutar `npm run lint` antes de todo commit. Corregir con `npx eslint "src/**/*.ts" --fix`.

### Comandos

```bash
npm run lint          # Chequear errores
npx eslint "src/**/*.ts" --fix  # Auto-fix
```

---

## 15. Convenciones de código

### Naming

| Tipo               | Convención                  | Ejemplo                                            |
| ------------------ | --------------------------- | -------------------------------------------------- |
| Archivos de módulo | camelCase                   | `billingPeriod.model.ts`, `creditCard.service.ts`  |
| Clases (entidades) | PascalCase                  | `CreditCard`, `BillingPeriod`                      |
| Interfaces         | PascalCase con `I` prefijo  | `IBaseEntity`, `IBaseRepository`                   |
| Clases de error    | PascalCase + `Error` sufijo | `RepositoryError`, `AuthError`                     |
| Variables locales  | camelCase                   | `const billingPeriods = ...` (NO `BillingPeriods`) |
| Funciones/métodos  | camelCase                   | `getBillingPeriods`, `createUser`                  |
| Constantes         | UPPER_SNAKE_CASE            | `CHILE_TZ`, `JWT_SECRET`                           |
| Params no usados   | prefijo `_`                 | `_req`, `_next`                                    |
| Router factory     | `createXRouter`             | `createBillingPeriodRouter`                        |
| Campos de entidad  | camelCase                   | `dueDate` (NUNCA `due_date`)                       |

### Imports (orden)

```typescript
// 1. Módulos de Node / paquetes de terceros
import { Router, Request, Response } from "express";
import { Timestamp } from "@google-cloud/firestore";

// 2. Imports de shared (aliases)
import { BaseService } from "@shared/classes/base.service";
import { IBaseEntity } from "@shared/interfaces/base.repository";
import { authenticate } from "@shared/middlewares/auth.middleware";

// 3. Imports de otros módulos
import { TransactionRepository } from "@modules/transaction/transaction.repository";

// 4. Imports locales (mismo módulo)
import { BillingPeriod } from "./billingPeriod.model";
import { BillingPeriodRepository } from "./billingPeriod.repository";
```

---

## 16. Scripts y comandos

| Comando         | Descripción                                                          |
| --------------- | -------------------------------------------------------------------- |
| `npm run dev`   | Desarrollo con `ts-node-dev -r tsconfig-paths/register` (hot reload) |
| `npm run build` | `tsc` + `tscpaths` para compilar y reescribir aliases                |
| `npm start`     | Arranca `dist/index.js` compilado                                    |
| `npm run lint`  | ESLint sobre `src/**/*.ts`                                           |

---

## 17. Variables de entorno

| Variable              | Propósito                          | Requerida    |
| --------------------- | ---------------------------------- | ------------ |
| `SERVICE_ACCOUNT_KEY` | Firebase SA key en base64          | Sí (prod/CI) |
| `FIREBASE_DB_URL`     | URL de Firestore                   | Sí           |
| `JWT_SECRET`          | Secret para firmar JWTs            | Sí           |
| `JWT_REFRESH_SECRET`  | Secret para refresh tokens         | Sí           |
| `PORT`                | Puerto del servidor (default 3000) | No           |

Para desarrollo local: se puede usar `src/config/serviceAccountKey.json` en lugar de `SERVICE_ACCOUNT_KEY` env var (NO versionar).

---

## 18. Integración con la app móvil

- La app consume la API en [../myquota-app/src/config/api.ts](../myquota-app/src/config/api.ts) (producción: `https://myquota-backend.onrender.com/api`).
- Desarrollo local: `http://localhost:3000/api` (Android emulator: `http://10.0.2.2:3000/api`).
- Las interfaces del frontend deben **reflejar los modelos del backend** (`src/modules/*/model.ts`).
- La API devuelve fechas como ISO 8601 strings, el frontend puede parsearlas directamente con `new Date()`.

### Sincronización de tipos backend → frontend (OBLIGATORIA)

| Modelo backend (`src/modules/*/model.ts`) | Tipo frontend (`myquota-app/src/shared/types/`) |
| ----------------------------------------- | ----------------------------------------------- |
| `CreditCard`                              | `creditCard.ts` → `CreditCard`                  |
| `Transaction`                             | `transaction.ts` → `Transaction`                |
| `Quota`                                   | `quota.ts` → `Quota`                            |
| `BillingPeriod`                           | `billingPeriod.ts` → `BillingPeriod`            |
| `User`                                    | `user.ts` → `UserInfo`                          |
| `Category`                                | `category.ts` → `Category`                      |

**Regla**: cuando se agrega, renombra o elimina un campo en una entidad del backend, TAMBIÉN se debe actualizar la interface correspondiente en `myquota-app/src/shared/types/`. Documentar en el PR/commit qué tipos se sincronizaron.

---

## 19. Deuda técnica conocida (no introducir más)

Estos problemas existen y deben resolverse progresivamente. **No agregar más instancias:**

1. **`TransactionService` demasiado grande** (~740 líneas) — mezcla CRUD, importación de emails, parsing HTML, lógica de cuotas. Meta: extraer en servicios especializados (`EmailImportService`, `QuotaInitializationService`).
2. **Repository boundary violations** — `TransactionRepository` gestiona subcolección `quotas` y `CreditCardRepository` gestiona subcolección `transactions`. Migrar para que cada repo maneje solo su colección.
3. **`stats` module incompleto** — `stats.repository.ts` vacío, `ExpenseStats` interface sin usar, métodos `static` mezclados con instancia. Refactorizar a un patrón limpio.
4. **`UserService` constructor bug** — Instancia `new UserRepository()` internamente ignorando el parámetro. Corregir para usar el repo inyectado.
5. **`MerchantPattern` no sigue el patrón** — No implementa `IBaseEntity`, repositorio no extiende `FirestoreRepository`. Integrar al patrón estándar.
6. **Snake_case en `Quota` model** — `due_date`, `payment_date` deben ser `dueDate`, `paymentDate`.
7. **Console logs excesivos** — Decenas de `console.log` con emojis en repos/services (📌, 🔥, ❌). Limpiar y usar solo `console.error` en catches.
8. **`errorHandler` middleware** — Tiene `console.warn(next)` y `console.warn(req)` debug leftovers. Limpiar.
9. **`@Collection` decorator sin uso** — El decorator existe pero nunca se lee el metadata. Eliminar junto con la dependencia `reflect-metadata`.
10. **No hay validación de `req.body`** — Se pasa directo a los services. Meta futura: agregar Zod o similar.
11. **No hay tests** — `"test": "echo \"Error: no test specified\" && exit 1"`.
12. **Variables de entorno sin validación** — `process.env.JWT_SECRET!` con non-null assertion. Si falta, crash opaco en runtime.
13. **Inconsistencia en monedas** — Código usa `"Dolar"` en algunos lugares y `"CLP"` en otros. Estandarizar.

---

## 20. Qué revisar antes de cambios de diseño

- **Cambios en `FirestoreRepository`** o `BaseService` afectan a TODOS los módulos. Testear manualmente cada uno.
- **Cambios en `firebase.ts`** pueden romper toda la persistencia — `db` es la referencia global de Firestore.
- **Cambios en `auth.middleware.ts`** afectan a todas las rutas autenticadas.
- **Nuevas rutas**: crear `createXRouter()` y montar en [src/index.ts](src/index.ts) con `app.use("/api", ...)`.
- **Nuevos campos en entidades**: actualizar el modelo AND las interfaces correspondientes en el frontend (`myquota-app/src/shared/types/`).

---

## 21. Checklist para agentes antes de entregar código

- [ ] ¿El módulo nuevo sigue el patrón model → repository → service → controller → routes?
- [ ] ¿La entidad implementa `IBaseEntity`?
- [ ] ¿El repositorio extiende `FirestoreRepository<T>` y gestiona SOLO su colección?
- [ ] ¿El servicio extiende `BaseService<T>` y recibe el repositorio por constructor?
- [ ] ¿El controller usa arrow functions con try/catch en cada método?
- [ ] ¿Los errores usan `error instanceof Error ? error.message : "Error desconocido"`?
- [ ] ¿Las variables locales están en camelCase?
- [ ] ¿Las rutas usan el patrón `res.locals` con `authenticate`?
- [ ] ¿`createXRouter` está montado en `index.ts`?
- [ ] ¿No se introdujo `any`?
- [ ] ¿Los imports usan aliases `@/`, `@shared/`, `@modules/`?
- [ ] ¿`npm run lint` pasa sin errores nuevos?
- [ ] ¿Los campos de entidad son camelCase?
- [ ] ¿No hay `console.log` innecesarios (solo `console.error` en catches)?

---

## 22. Archivos clave (dónde mirar primero)

| Archivo                                                                                  | Propósito                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| [src/index.ts](src/index.ts)                                                             | Express app, montaje de routers          |
| [src/config/firebase.ts](src/config/firebase.ts)                                         | Inicialización de Firebase, exporta `db` |
| [src/shared/classes/firestore.repository.ts](src/shared/classes/firestore.repository.ts) | CRUD genérico sobre Firestore            |
| [src/shared/classes/base.service.ts](src/shared/classes/base.service.ts)                 | Servicio CRUD genérico                   |
| [src/shared/interfaces/base.repository.ts](src/shared/interfaces/base.repository.ts)     | `IBaseEntity`, `IBaseRepository`         |
| [src/shared/middlewares/auth.middleware.ts](src/shared/middlewares/auth.middleware.ts)   | JWT authentication                       |
| [src/shared/errors/custom.error.ts](src/shared/errors/custom.error.ts)                   | `RepositoryError`, `AuthError`           |
| [src/shared/utils/date.utils.ts](src/shared/utils/date.utils.ts)                         | Utilidades de fecha Chile                |
| [package.json](package.json)                                                             | Scripts y dependencias                   |
| [tsconfig.json](tsconfig.json)                                                           | Config TypeScript (strict + aliases)     |
| [eslint.config.mjs](eslint.config.mjs)                                                   | Config ESLint 9                          |

---

## 23. Rendimiento y Vistas Materializadas en Firestore

### El problema: reads costosos en cold start

En el Spark plan (free), Firestore tiene un límite de 50K reads/día. Algunos endpoints agregan datos de muchos documentos (ej. `GET /stats/debt-summary` ≈ 789 reads). Un cache en memoria reduce esto en warm, pero se reinicia cuando el servidor se duerme (Render: ~15 min de inactividad → cold start).

### Solución: 3 niveles de caché en cascada

Para endpoints de **lectura costosa cuyo resultado solo cambia al escribir**, aplicar el patrón de **vista materializada** (pre-computed Firestore document):

```
GET request:
  ├── L1: CacheService (memoria)     → hit? return               (0 reads, ms)
  ├── L2: Firestore summary doc      → existe y fresco? return   (1 read)
  └── L3: Compute full Firestore     → guardar L2 + L1 → return  (N reads)

POST/PUT/DELETE request:
  ├── Invalidar L1 inmediatamente (síncrono)
  └── Recomputar async → persistir en L2 (fire-and-forget, no bloquea)
```

### Cuándo usar este patrón

Aplicar cuando **TODAS** estas condiciones se cumplen:
1. El resultado requiere **más de 50 reads** de Firestore
2. El resultado **solo cambia cuando el usuario escribe datos** (no con el tiempo)
3. El endpoint se llama con **frecuencia alta** (Dashboard, stats, counts)
4. La **latencia de cómputo** sería perceptible al usuario (> 500ms)

### Cuándo NO usar

- Consultas simples (< 20 reads) → usar solo `CacheService` en memoria
- Datos en tiempo real o que cambian sin writes (cotizaciones, fechas)
- Endpoints de escritura — nunca cachear respuestas de writes

### Summaries disponibles actualmente

| Summary        | Path en Firestore                                                  | Lógica de cómputo         |
| -------------- | ------------------------------------------------------------------ | ------------------------- |
| `debtSummary`  | `users/{userId}/summaries/debtSummary`                             | `StatsService`            |
| `monthlyStats` | `users/{userId}/creditCards/{creditCardId}/summaries/monthlyStats` | `StatsService`            |

Estructura del documento Firestore:
```json
{
  "data": { /* DebtSummary | MonthlyStatEntry[] | etc. */ },
  "computedAt": "2025-03-03T10:00:00.000Z"
}
```

### Implementación — guía paso a paso

**1. Agregar ref helpers privados estáticos al service:**
```typescript
private static mySummaryRef(userId: string) {
  return db
    .collection("users").doc(userId)
    .collection("summaries").doc("mySummary");
}
```

**2. Separar el cómputo puro en un método privado:**
```typescript
private static async _computeMySummary(userId: string): Promise<MySummary> {
  // ... lógica con reads de Firestore. Sin caching aquí.
}
```

**3. Método público con 3 niveles (L1 → L2 → L3):**
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

  // L3: cómputo completo (~N reads)  ← solo en cold start o datos viejos
  const result = await MyService._computeMySummary(userId);
  MyService.mySummaryRef(userId)
    .set({ data: result, computedAt: new Date().toISOString() })
    .catch((err) => console.error("Failed to persist summary:", err));
  CacheService.set(memKey, result, CacheTTL.LONG);
  return result;
}
```

**4. Controllers: usar `StatsService.triggerRecompute` después de cada write:**
```typescript
// ✅ Correcto — en lugar de CacheService.invalidateByPrefix(...)
const userId = req.user?.userId;
if (userId) StatsService.triggerRecompute(userId, req.params.creditCardId);
```

**`triggerRecompute(userId, creditCardId?)`** hace dos cosas:
1. Invalida L1 inmediatamente (síncrono)
2. Dispara recompute de todos los summaries relevantes en background (sin bloquear la respuesta)

### Reglas obligatorias del patrón

- **NUNCA** bloquear la respuesta con `await` al persistir el summary — siempre `.catch(console.error)` asíncrono.
- **SIEMPRE** tener fallback de L2 a L3 sin propagar el error al usuario (el `try/catch` en L2 es obligatorio).
- **Agregar la clave** del summary a `CacheKeys` en [src/shared/services/cache.service.ts](src/shared/services/cache.service.ts).
- **Documentar el costo estimado** de L3 en el JSDoc: `* L3: full compute (~789 reads)`.
- **NO llamar** `CacheService.invalidateByPrefix` directamente desde controllers — usar siempre `StatsService.triggerRecompute` para datos que tienen summary en Firestore.
- El summary tiene **30 minutos de frescura máxima** (`SUMMARY_MAX_AGE_MS`). Ajustar si el dominio lo requiere.
