# AI Agent Skills — MyQuota Backend

This directory contains project-specific skills for repo-aware agents.

## Setup

Run:

```bash
./skills/setup.sh
```

This keeps `AGENTS.md` and `.github/copilot-instructions.md` aligned for Copilot and other repo-aware agents.

## Available Skills

| Skill | Description |
| --- | --- |
| `myquota-module` | Module layering and boilerplate |
| `myquota-repository` | SupabaseRepository and SQL persistence patterns |
| `myquota-service` | Service and orchestration patterns |
| `myquota-controller` | Thin controllers with error handling |
| `myquota-routes` | Route wiring, auth, and validation |
| `myquota-auth` | Supabase Auth, middleware, refresh/logout flows |
| `myquota-dates` | Date and timezone handling |
| `myquota-cache` | In-memory cache and SQL query optimization |
| `sync-types` | Backend/frontend type sync |

## Maintenance

When you change a skill or repo-wide guidance:

1. Update the relevant `SKILL.md` or `AGENTS.md`.
2. Keep `.github/copilot-instructions.md` aligned.
3. Run `./skills/skill-sync/assets/sync.sh` if auto-invoke metadata changed.
4. Run `./skills/setup.sh` if Copilot instructions need to be refreshed.

## Design Principles

- Prefer focused, current guidance over historical implementation notes.
- Preserve repo conventions: layering, validation, error handling, import order, and thin controllers.
- Do not teach Firestore-era persistence or cache patterns as active architecture.
