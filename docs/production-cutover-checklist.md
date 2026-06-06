# Production Cutover Checklist
## Firestore → Supabase Migration — Phase 8

This document tracks the production cutover process. The 30-day observation window begins after `USE_SUPABASE=true` is deployed to production.

---

## Pre-Deployment (PR #4)

- [x] Phase 7: Parity tests created and passing (`tests/integration/supabase-parity.test.ts`)
- [x] Phase 8.1: `user_tokens` table present in `supabase/migrations/001_initial_schema.sql`
- [x] Phase 8.2: `USE_SUPABASE=true` set in `.env.production.template`
- [x] Phase 8.4: All Firestore code removed (`firebase-admin`, `firebase` packages, `src/config/firebase.ts`, `FirestoreRepository`, collectionGroup queries)
- [x] Phase 8.5: `firebase-admin` and `firebase` removed from `package.json`
- [ ] All existing tests pass (`npm test`)
- [ ] `npm run build` compiles without errors

---

## Deployment Day (Day 0)

- [ ] Set `USE_SUPABASE=true` in production `.env` on VPS
- [ ] Pull latest from `main` branch
- [ ] Run `npm ci` to install dependencies
- [ ] Run `npm run build` to compile TypeScript
- [ ] Run `pm2 restart myquota-backend --update-env`
- [ ] Verify `pm2 list` shows process running
- [ ] Check logs: `pm2 logs myquota-backend --lines 50`

---

## Immediate Smoke Tests (First 15 Minutes)

- [ ] `GET /health` returns 200
- [ ] `GET /stats/debt-summary` returns valid JSON with `totalCLP` and `totalUSD`
- [ ] `GET /creditCards/:id/stats/monthly` returns valid JSON with `month` and `totalCLP`
- [ ] `GET /creditCards/:id/stats/monthly-quota-sum` returns valid JSON array
- [ ] `GET /transactions?limit=10` returns paginated results
- [ ] `GET /categories` returns category list
- [ ] Check `pm2 logs` for no new ERROR entries

---

## 24-Hour Checkpoint

- [ ] Error rates are nominal (no spike above 1% error rate)
- [ ] Response times are within SLA (< 500ms p95 for stats endpoints)
- [ ] No `USE_SUPABASE=false` fallback errors in logs
- [ ] Supabase DB connection pool is healthy (check Supabase dashboard)
- [ ] L1 cache is functioning (check response times on repeated requests)

---

## 7-Day Checkpoint

- [ ] Review Supabase dashboard for query performance
- [ ] Verify no slow queries (> 1s) in Supabase Query Performance
- [ ] Check RLS policies are enforcing correctly (test with different user tokens)
- [ ] Confirm `user_tokens` table is being used for Gmail OAuth (check row count)
- [ ] Verify debt forecast endpoint returns correct data

---

## 15-Day Checkpoint

- [ ] Run `EXPLAIN ANALYZE` on key SQL queries to verify index usage:
  - `executeDebtSummaryQuery` (should use `idx_quota_credit_card`)
  - `executeMonthlyStatsQuery` (should use `idx_tx_cc_date`)
  - `executePendingQuotasByUserQuery` (should use `idx_quota_status_deleted`)
- [ ] Review Supabase billing — confirm within free tier limits or expected usage
- [ ] No firebase-admin or Firestore SDK references remain in codebase

---

## 30-Day Checkpoint (Final)

Complete only after 30 days of stable operation with `USE_SUPABASE=true`.

- [ ] DELETE `src/shared/classes/firestore.repository.ts` (if not already deleted in PR 4)
- [ ] DELETE `src/config/firebase.ts` (if not already deleted in PR 4)
- [ ] DELETE any remaining Firestore repository subclasses:
  - `src/modules/transaction/transaction.repository.ts`
  - `src/modules/creditCard/creditCard.repository.ts`
  - `src/modules/billingPeriod/billingPeriod.repository.ts`
  - `src/modules/category/category.repository.ts`
  - `src/modules/user/user.repository.ts`
  - `src/modules/auth/revokedToken.repository.ts`
- [ ] UPDATE `env.validation.ts` to remove `SERVICE_ACCOUNT_KEY` and `FIREBASE_DB_URL` validation (no longer needed)
- [ ] UPDATE `repository.factory.ts` to remove all Firestore repository classes and `FirestoreRepository` imports
- [ ] UPDATE `src/index.ts` or app startup to remove any `validateFirestoreEnv()` calls
- [ ] Commit cleanup changes with message: `chore: remove Firestore code after 30-day observation`

---

## Rollback Procedure (If Needed)

If critical issues are found during the observation window:

1. Set `USE_SUPABASE=false` in production `.env`
2. Restart: `pm2 restart myquota-backend --update-env`
3. All Firestore code is still present (was removed in PR 4 — this is why we removed it in PR 4, not after 30 days)
4. Open an issue with `firebase-admin` and `firebase` packages restored temporarily

**Note:** This rollback procedure is kept as reference only. Since Firestore code was removed in PR 4, a true rollback would require re-adding the Firestore code from git history.

---

## Key Metrics to Monitor

| Metric | Target | How to Check |
|--------|--------|--------------|
| Error rate | < 1% | `pm2 logs` ERROR count / total requests |
| p95 latency | < 500ms | Supabase dashboard or APM |
| DB connections | < 60 | Supabase dashboard → Connection Pooling |
| Cache hit rate | > 80% | Response times on repeated requests |

---

## Contacts

- **VPS SSH**: `ubuntu@<vps-ip>` (key in password manager)
- **Supabase Dashboard**: https://supabase.com/dashboard/project/<ref>
- **GitHub Actions**: https://github.com/gcabr/myquota-backend/actions
- **PM2**: `pm2 list`, `pm2 logs myquota-backend`

---

Last updated: PR #4 (Phase 7 + 8 implementation)