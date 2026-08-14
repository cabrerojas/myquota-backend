---
name: myquota-auth
description: >
  Current authentication patterns: Supabase Auth, Google Sign-In, authenticate middleware, token revocation, and JWT fallback flows.
  Trigger: When working with authentication, protected routes, refresh/logout flows, or auth-related env/config.
license: MIT
metadata:
  author: myquota
  version: "1.1"
  auto_invoke:
    - "Working with JWT auth"
    - "Implementing authentication"
    - "Handling refresh tokens"
---

## Purpose

Work with the current auth stack accurately: Supabase Auth is the primary identity system, Google Sign-In is the main login path, revoked-token checks run in middleware, and JWT fallback paths still exist in the codebase.

## Current Flow

```text
1. Client sends Google credentials
   -> POST /api/auth/login/google

2. Backend verifies with Supabase Auth first
   -> supabase.auth.signInWithIdToken()

3. Backend returns session tokens

4. Protected requests send Authorization: Bearer <token>

5. authenticate middleware checks revocation, then validates via Supabase auth.getUser()

6. JWT fallback paths remain for compatibility and some refresh/logout flows
```

## Protected Route Rules

- `authenticate` must run before protected handlers.
- Use `req.user?.userId` after middleware.
- Keep request type augmentation in `auth.middleware.ts`.
- Preserve revoked-token checks on protected requests.

## Public Routes

- `POST /api/auth/login/google`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- health routes

## Env Rules

Use `getEnv()` in auth services, controllers, and middleware.

Relevant vars:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ACCESS_TOKEN_EXPIRES_IN`
- `REFRESH_TOKEN_EXPIRES_IN`

Direct `process.env` access is limited to env/bootstrap config files.

## Notes

- Do not teach Firestore as the primary auth persistence path.
- Do not remove JWT guidance entirely; fallback/custom JWT paths still exist.
- Logout is part of the active contract because revoked-token storage is enforced.

## Checklist

- [ ] Supabase Auth is treated as the primary verification path
- [ ] Revoked-token checks are preserved
- [ ] Public/protected route split matches current routes
- [ ] Env access uses `getEnv()` outside env/bootstrap config files
- [ ] New guidance does not describe Firestore as the main auth model
