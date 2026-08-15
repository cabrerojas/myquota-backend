---
name: myquota-cache
description: >
  Current cache strategy: in-memory TTL cache backed by SQL-level query optimization.
  Trigger: When implementing cache invalidation, optimizing expensive reads, or deciding whether DB-side precomputation is justified.
license: MIT
metadata:
  author: myquota
  version: "1.1"
  auto_invoke:
    - "Implementing caching"
    - "Creating materialized views"
    - "Optimizing expensive reads"
---

## Purpose

Use caching to avoid repeated expensive work, but treat SQL efficiency as the first optimization layer.

## Current Reality

- The active backend uses Supabase/Postgres, not Firestore summaries.
- `CacheService` is an in-memory TTL cache.
- `StatsService` currently uses L1 memory cache plus SQL helpers.
- Do not assume Firestore L2 summary documents still exist.

## Preferred Flow

```text
GET:
  1. Check CacheService
  2. If miss, run repository/SQL query
  3. Store result in CacheService

WRITE:
  1. Persist write
  2. Invalidate affected cache keys immediately
```

## Rules

- First optimize the query, then cache it.
- Push filters, joins, and pagination into SQL.
- Keep cache wrappers small and explicit.
- Prefer narrow invalidation over broad prefix wipes when the service knows the affected scope.
- Controllers should call service invalidation helpers instead of reaching into cache internals directly.

## When DB-Side Precomputation Is Justified

If L1 caching plus efficient SQL is still not enough, consider explicit Postgres constructs such as:

- materialized views
- summary tables
- indexed helper queries

Any DB-side precomputation must be reviewed against current Supabase/Postgres practices before implementation.

## Checklist

- [ ] Query is SQL-efficient before adding cache
- [ ] Cache key is defined in `CacheKeys`
- [ ] Cache invalidation path is explicit
- [ ] Controllers call service helpers instead of cache internals
- [ ] Guidance does not refer to Firestore summary documents as active architecture
