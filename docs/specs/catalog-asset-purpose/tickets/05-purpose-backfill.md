# 05-purpose-backfill: Backfill button on the catalog page

**What to build:** The catalog page shows "Gerar finalidades (N)" while N > 0. The confirmation dialog states N, and confirming queues jobs for the latest and active versions that have no purpose and no open job.

**Blocked by:** 01-purpose-tracer-bullet

**Status:** ready

## Requirements
- AP-12, AP-13

## Technical details
- The query selects each asset's latest version and its active version, deduped, with `purposeSource = none` and no open `asset-purpose` job.
- The command enqueues exactly that set, bounded at 500 per call, and returns `{ requested, failed }`.
- Two routes as in C-P4 under the owner guard. The button and dialog reuse the existing dialog and button components. Nothing is enqueued before the owner confirms.

## Acceptance criteria
- [ ] AP-12 as written in the plan.
- [ ] AP-13 as written in the plan.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected requester and model client.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in a production path.
- [ ] No edit outside the exclusive paths, and no edit to the PRD, ADR 0012, the plan or the ticket files.
- [ ] No check, build, test, migration run, install or git write was run by this ticket. Review evidence comes from inspection.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/catalog/queries/count-missing-purposes.query.ts`, `packages/core/src/catalog/queries/count-missing-purposes.handler.ts`, `packages/core/src/asset-jobs/commands/request-purpose-backfill.command.ts`, `packages/core/src/asset-jobs/commands/request-purpose-backfill.handler.ts`, `apps/api/src/catalog/asset-purpose-backfill.controller.ts`, `apps/web/src/features/catalog/components/PurposeBackfillButton.tsx`, `apps/web/src/app/(studio)/catalogo/page.tsx`
- dependsOn: 01-purpose-tracer-bullet
- Owner: backend-coordinator
- Risk / autonomy: high / A2 (working tree only)
- Acceptance ids: AP-12, AP-13
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contracts
