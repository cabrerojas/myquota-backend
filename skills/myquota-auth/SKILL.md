---
name: myquota-auth
description: >
  Patrones de autenticación: JWT flow, authenticate middleware, type augmentation, refresh tokens.
  Trigger: Cuando se trabaja con autenticación, JWT, o se necesita el flujo de auth.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Working with JWT auth"
    - "Implementing authentication"
    - "Handling refresh tokens"
---

## Propósito

Entender y trabajar con el sistema de autenticación de MyQuota basado en Google Sign-In + JWT.

---

## Flujo de Autenticación

```
1. App envía idToken de Google Sign-In
   └── POST /api/login/google { idToken }

2. Backend verifica con Google
   └── oauth2Client.verifyIdToken()

3. Backend busca/crea usuario en Firestore
   └── UserRepository.findByEmail() || create()

4. Backend genera tokens
   └── accessToken (JWT corto, ~15min)
   └── refreshToken (JWT largo, ~7d)

5. App guarda tokens y los adjunta en requests
   └── Authorization: Bearer <accessToken>

6. Middleware authenticate valida JWT
   └── req.user = { userId }

7. Si token expira → 401 { code: "token_expired" }
   └── App usa POST /api/refresh con refreshToken
```

---

## Middleware authenticate

Ubicación: `src/shared/middlewares/auth.middleware.ts`

```typescript
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "@config/env.validation";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Token no proporcionado" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, getEnv().JWT_SECRET) as {
      userId: string;
    };

    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        message: "Token expirado",
        code: "token_expired",
      });
      return;
    }

    res.status(401).json({ message: "Token inválido" });
  }
};
```

---

## Type Augmentation

Para tipificar `req.user` globalmente:

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

Esto permite usar `req.user?.userId` en cualquier parte del código con type safety.

**Regla**: NO crear otras augmentaciones del `Request` sin documentarlas.

---

## Generación de Tokens

```typescript
// En AuthService
generateTokens(userId: string): { accessToken: string; refreshToken: string } {
  const env = getEnv();
  const accessToken = jwt.sign(
    { userId },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}
```

---

## Refresh Token Flow

```typescript
// AuthController
refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ message: "Refresh token requerido" });
      return;
    }

    const decoded = jwt.verify(
      refreshToken,
      getEnv().JWT_REFRESH_SECRET,
    ) as { userId: string };

    const tokens = this.service.generateTokens(decoded.userId);
    res.status(200).json(tokens);
  } catch (error) {
    res.status(401).json({ message: "Refresh token inválido" });
  }
};
```

---

## Variables de Entorno

Acceder siempre via `getEnv()` de `@config/env.validation`.

| Variable                  | Propósito                                 |
| ------------------------- | ----------------------------------------- |
| `JWT_SECRET`              | Secret para firmar access tokens          |
| `JWT_REFRESH_SECRET`      | Secret para firmar refresh tokens         |
| `GOOGLE_CLIENT_ID`        | Google OAuth client ID                    |
| `ACCESS_TOKEN_EXPIRES_IN` | TTL del access token (default "15m")      |
| `REFRESH_TOKEN_EXPIRES_IN`| TTL del refresh token (default "30d")     |

**Importante**: Usar secrets diferentes para access y refresh tokens.
**Importante**: NUNCA usar `process.env` directo — siempre `getEnv()`.

---

## Uso en Routes

```typescript
import { authenticate } from "@shared/middlewares/auth.middleware";

router.use(
  "/myEntities",
  authenticate, // ← Valida JWT y asigna req.user
  (req, res, next) => {
    const userId = req.user?.userId; // ← Siempre disponible después de authenticate
    // ...
  },
);
```

---

## Rutas Públicas

Las únicas rutas sin `authenticate`:

- `POST /api/login/google` — Login con Google
- `POST /api/refresh` — Refrescar tokens
- `POST /api/register` — Registro (si aplica)

---

## Manejo de Errores de Auth

```typescript
// Token no proporcionado
res.status(401).json({ message: "Token no proporcionado" });

// Token expirado (app debe hacer refresh)
res.status(401).json({
  message: "Token expirado",
  code: "token_expired", // ← Para que la app sepa que debe refrescar
});

// Token inválido (malformado, firma incorrecta)
res.status(401).json({ message: "Token inválido" });

// Refresh token inválido
res.status(401).json({ message: "Refresh token inválido" });
```

---

## Checklist

- [ ] `authenticate` middleware primero en rutas protegidas
- [ ] `req.user?.userId` usado para obtener userId
- [ ] Type augmentation declarado en auth.middleware.ts
- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` en variables de entorno
- [ ] Respuesta incluye `code: "token_expired"` cuando aplica
- [ ] Rutas públicas no usan authenticate
