# Fix billing-period month invariant

## Objective

Prevent invalid `month` values from reaching `public.billing_periods.month` by enforcing the canonical `YYYY-MM` calendar-month format at both HTTP and service boundaries.

## Problem

The database column is correctly `VARCHAR(7)`, but the request schema currently accepts arbitrary non-empty strings and the BillingPeriod service and repository forward them unchanged. This allows invalid or overlong input to cause persistence failures.

## Scope

- Add focused Jest coverage before implementation.
- Validate create and update request payloads using a real canonical calendar-month rule.
- Enforce the same invariant for programmatic BillingPeriod service callers on create and update.
- Preserve existing date normalization and persistence behavior.
- Record execution evidence in this document and its Engram mirror.

## Constraints

- No database migration or database modification.
- Do not silently truncate arbitrary input.
- Strict TDD: observe a focused Jest RED failure before source implementation.
- Use the existing Jest runner and repository-local conventions.
- Do not repair the known corrupt Git index.
- Do not push or open a pull request.

## Checklist

- [x] BPM-01: Inspect BillingPeriod schemas, service, repository, and test conventions.
- [x] BPM-02: Add focused regression tests for valid canonical months, invalid or overlong values, and persistence inputs.
- [x] BPM-03: Run focused Jest tests and record the expected RED failure.
- [x] BPM-04: Implement HTTP schema validation and service-level invariant normalization.
- [x] BPM-05: Run focused Jest tests and record GREEN evidence.
- [x] BPM-06: Run `npm run lint` and `npm run build` and record exact outcomes.
- [ ] BPM-07: Run the native receipt workflow after a successful commit, only when its repository mode is enabled.
- [ ] BPM-08: Create one conventional work-unit commit without repairing the Git index; record its observed result.

## Acceptance criteria

1. HTTP create and update schemas accept only canonical, real months from `0000-01` through `9999-12` where the year has exactly four digits and the month is `01`–`12`.
2. Non-canonical, impossible, empty, and overlong month strings are rejected at the HTTP schema boundary.
3. `BillingPeriodService.create` and `BillingPeriodService.update` reject invalid programmatic month input and pass only the canonical value to persistence.
4. Existing date normalization remains intact.
5. Focused Jest tests, lint, and build have recorded observed outcomes.

## TDD mode and checks

- Mode: strict red-green.
- Initial test target: focused BillingPeriod schema and service regression tests.
- RED proof: required before implementation source changes.
- GREEN proof: required after implementation source changes.

## Route and delegation evidence

- Target repository: `/mnt/c/Users/gcabr/proyectos/myquota-backend`.
- Started from `main`; created local branch `fix/billing-period-month` before changes.
- CodeGraph explored `BillingPeriodService`, `BillingPeriodRepositorySupabase`, and model dependencies before broad source inspection.
- Loaded required skills: `myquota-dates`, `myquota-service`, `myquota-repository`, `work-unit-commits`, and `supabase`; additionally loaded `myquota-routes` because the change modifies Zod request validation.
- This task is Organic Driven Development. No delegation tooling is available in this execution environment; work is performed in this authorized local repository only.

## Running verification and commit evidence

| Step | Status | Observed evidence |
| --- | --- | --- |
| ODD document | complete | Created before source edits. |
| Engram mirror | complete | Saved as Engram observation #586 and read back before source edits. |
| BPM-01 inspection | complete | `billingPeriod.schemas.ts` accepts `z.string().min(1)`; service normalizes dates only; Jest is configured for `src/**/*.spec.ts`; no BillingPeriod tests exist. |
| Focused Jest RED | complete | `npx jest src/modules/billingPeriod/billingPeriod.service.spec.ts --runInBand --colors` failed as expected: 10 failures, 5 passes. Invalid strings were accepted by schemas and service calls resolved instead of rejecting. |
| Focused Jest GREEN | complete | `npx jest src/modules/billingPeriod/billingPeriod.service.spec.ts --runInBand --colors` passed: 1 suite, 15 tests. |
| Lint | complete | `npm run lint` exited 0 with 2 pre-existing warnings in `src/modules/stats/stats.service.ts` for unused disable directives; no errors. |
| Build | complete (blocked) | `npm run build` failed with pre-existing TS6133 errors for unused `req` parameters in `src/modules/transaction/transaction.controller.ts` lines 212 and 228; neither file is part of this change. |
| Native receipt workflow | pending | No commit exists. Post-commit assessment has not been attempted and is conditional on an enabled repository mode. |
| Work-unit commit | pending | No commit has been observed. The corrected task record is staged before one permitted staging and commit attempt. |

## Rollback boundary

Remove the BillingPeriod month validation, service invariant logic, focused tests, and this ODD task record as one isolated work unit; no database state changes are involved.
