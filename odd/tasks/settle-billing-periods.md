# Settle Billing Periods

## Objective

Replace the ambiguous billing-period payment operation with an explicit,
idempotent statement-settlement contract. The backend records one durable
settlement per billing period, preserves immutable settled-quota evidence, and
returns a settlement-specific outcome.

## Scope

- Add a local-only Supabase migration for settlement aggregates, immutable
  settlement lines, RLS, grants, constraints, and indexes.
- Add one atomic PostgreSQL RPC that authorizes card ownership, derives the
  billing period server-side, identifies eligible transactions, stores the
  aggregate and lines, and marks exactly the eligible pending quotas paid.
- Expose the RPC through the existing billing-period repository, service,
  controller, and protected route conventions.
- Retain cache invalidation for changed quota/forecast data.
- Add focused unit/contract tests and validate the local migration where local
  tooling permits.

## Constraints

- Work only in `myquota-backend`; do not alter the app repository.
- Do not apply migrations to remote Supabase or mutate a remote database.
- Use server registration time only; never accept or persist an external
  historical payment date.
- Keep forecast and debt-scheduling queries based on quota due dates.
- Do not invoke GGA.
- Branch from the default branch before implementation and finish with one
  conventional work-unit commit; do not push or open a PR.

## Exact Business Invariant

A settlement belongs to a statement when the root, non-deleted transaction's
`transactions.transaction_date` is within the selected billing period's
inclusive `[start_date, end_date]`. For those transactions, settle only pending
quota lines whose `quotas.due_date <= billing_periods.due_date`. Later-due
installments for the same in-range transaction MUST remain pending and remain in
the due-date-based forecast. The known July 2026 evidence has 81 in-range
transactions and five later-due installment quotas; settlement must not erase
that future debt.

## Stable Tasks

1. Map current billing-period payment flow, existing schema/migration patterns,
   cache keys, and test harness; record route/delegation evidence.
2. Write RED tests for the settlement repository/service contract: transaction
   date membership, future-installment preservation, idempotency, zero balance,
   and no 50-row cap.
3. Add the local migration and atomic RPC with durable aggregate/line storage,
   ownership enforcement, idempotent retry, and exact due-date selection.
4. Implement the repository, service, controller, schema, and route contract;
   preserve cache invalidation and temporary compatibility only if it returns
   settlement-specific data.
5. Make tests GREEN, run focused tests, lint, build/typecheck, and local SQL
   validation; record actual results and commit evidence.

## TDD and Checks

- Start with failing focused tests before production implementation and record
  the RED command/result.
- GREEN tests must assert RPC argument delegation and the full returned
  settlement outcome; without a migrated local database they are contract tests,
  not database integration proof.
- Run focused tests, lint, build/typecheck, and any available local Supabase SQL
  validation. Record base failures separately from introduced failures.

## Route and Delegation Evidence

Mapped before implementation: `src/index.ts` mounts the billing-period router
at `/api`; its protected route is
`POST /creditCards/:creditCardId/billingPeriods/:billingPeriodId/pay`. The
request middleware authenticates, builds the billing-period and transaction
repositories through the factory, injects them into `BillingPeriodService`, and
stores `BillingPeriodController` in `res.locals`. The existing
`payBillingPeriod` path then fetches a paginated transaction list (default 50),
filters quotas in memory by quota due date, and marks them one-by-one. That is
the wrong non-atomic delegation and is replaced by one repository RPC call.

The new application delegation is route → controller →
`BillingPeriodService.settleBillingPeriod` →
`BillingPeriodRepositorySupabase.settleBillingPeriod` →
`settle_billing_period` RPC. The service triggers
`StatsService.triggerRecompute(userId, creditCardId)`, which invalidates the
user prefix and `debtForecast:${userId}`; the billing-period list cache stays
invalidated by existing period writes. Database code is authoritative for card
ownership, period membership, root-transaction filtering, quota selection, and
the atomic state transition.

CodeGraph was unavailable because this repository has no `.codegraph/` index;
the workspace rule reserves index creation for the user, so this mapping used
the local source fallback.

## Acceptance Criteria

- Settlement membership uses transaction date, not quota due date.
- The RPC is atomic, server-authorized, idempotent, and has no broad
  50-transaction cap.
- Aggregate storage supports zero-balance statements and retry returns the
  original full outcome.
- Immutable settlement lines reference exactly the quotas marked paid.
- Future installments on in-range transactions remain pending and forecasted.
- API returns settlement-specific data and invalidates affected caches.
- Tests cover every invariant above; local checks and work-unit commit evidence
  are captured below.

## Verification and Commit Evidence

Task 1 complete: mapped the flow above. The old `TransactionRepository.findAll`
has a default 50-row limit, which proves it cannot be used for statement
settlement. No source or migration was changed during this task.

Task 2 RED: `npm test -- --runTestsByPath
src/modules/billingPeriod/billingPeriod.settlement.spec.ts` failed before
implementation with TS2339 because `BillingPeriodService.settleBillingPeriod`
did not exist. The test defines the service/RPC contract and checks migration
text for transaction-date membership, due-date cutoff, root-only filtering,
idempotency, zero balance, and no `LIMIT 50`.

Tasks 3 and 4 complete: local migration
`006_settle_billing_periods.sql` adds aggregate and immutable line tables,
unique/idempotency constraints, RLS select policies, least-privilege grants,
indexes, and a service-role-only `SECURITY INVOKER` RPC. It locks the owned
billing period, records a settlement even with no eligible quotas, snapshots
eligible pending quotas, and updates those exact quotas in the same transaction.
The route is now `POST
/creditCards/:creditCardId/billingPeriods/:billingPeriodId/settle`; the
application sends only the period id and derives server registration time in
the RPC. The service performs cache invalidation through
`StatsService.triggerRecompute` after the RPC outcome.

GREEN focused checks: `npm test -- --runTestsByPath
src/modules/billingPeriod/billingPeriod.settlement.spec.ts
src/modules/billingPeriod/billingPeriod.service.spec.ts` passed: 2 suites, 19
tests. `npm run build` passed. `npm run lint` exited zero with two pre-existing
warnings in `src/modules/stats/stats.service.ts` (unused disable directives).
`supabase --version && supabase migration list --local` could not run because
the local Supabase CLI is not installed (`/bin/bash: supabase: command not
found`); no remote database was contacted and no integration proof is claimed.

Task 5 complete: full `npm test` passed (3 suites, 26 tests); the
Node process emitted the pre-existing `DEP0040` punycode deprecation warning.
`npm run build` passed, with pre-existing `tscpaths` notices for removed
Firebase repository aliases. `npm run lint` passed with the two unrelated
`stats.service.ts` warnings noted above. `git diff --check` passed. SQL was not
executed locally: Supabase CLI and `psql` are unavailable, and the local Docker
daemon has no `postgres:16` image. The migration's focused static contract test
is GREEN; database integration remains explicitly unproven until a local
migrated Postgres/Supabase instance is available. The implementation was
committed on `feat/settle-billing-periods` as
`fb8ab76d28d3e62cf99e111256570d04dceb876b`
(`feat: settle billing periods atomically`). Observed commit contents include
this task record, the settlement migration, billing-period implementation, and
the focused settlement test; it contains 584 insertions and 68 deletions across
eight files.

## ODD Mirror

Engram project: `myquota-backend`

Topic key: `odd/settle-billing-periods/tasks`

State: tasks 1–5 verified and mirrored; implementation committed as
`fb8ab76d28d3e62cf99e111256570d04dceb876b`.
