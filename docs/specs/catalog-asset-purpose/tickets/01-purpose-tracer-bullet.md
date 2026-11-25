# 01-purpose-tracer-bullet: Tracer bullet: save → AI job → purpose on the detail page

**What to build:** Saving any asset queues an `asset-purpose` job. The watcher writes a purpose from metadata, or from name, kind and tags only for biometric rows. The api copies it into the row on read, and the detail page shows the text, the pending state, or failed/refused with Retry.

**Blocked by:** None (can start immediately)

**Status:** ready

## Requirements
- AP-01, AP-02, AP-03, AP-04, AP-05, AP-07, AP-09 (Retry part)

## Technical details
- Migration `asset_purpose`: two columns with defaults (C-P1). Shared fields, the `purposeJob` view (C-P2), job kind `asset-purpose` and its `done` fields (C-P3).
- `AssetPurposeEnqueuer`, modelled on `ReferenceAnalysisEnqueuer`, is called after `create`, `saveVersion` and `registerByReference`. A failed enqueue is logged and never thrown.
- `asset-purpose-writer` agent: tool-less, `SONNET_MODEL_ID`, live, mock and Claude Code engines like `reference-analyst`. The prompt treats asset text as data, and the output is checked against AP-04.
- Watcher `AssetPurposeHandler`: resolve the row, pick the input with C-P6 (only the metadata `purposeInput` here, plus `biometricPurposeInput`), month ceiling, egress line, call, write the job file.
- `asset-purpose.sync.ts`: a conditional update `WHERE purpose_source <> 'owner'`, wired into the list, detail and get reads.
- The `POST .../purpose/generation` route (C-P4) is used by Retry. The PUT route comes in ticket 03 and the backfill routes in ticket 05.
- `AssetPurposeCard` on the detail page: text, pending, failed or refused with reason and Retry. Every C-P5 i18n key goes into all three locales, ticket 01 being their only owner.

## Acceptance criteria
- [ ] AP-01 as written in the plan.
- [ ] AP-02 as written in the plan.
- [ ] AP-03 as written in the plan.
- [ ] AP-04 as written in the plan.
- [ ] AP-05 as written in the plan.
- [ ] AP-07 as written in the plan.
- [ ] AP-09 (Retry part) as written in the plan.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected requester and model client.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in a production path.
- [ ] No edit outside the exclusive paths, and no edit to the PRD, ADR 0012, the plan or the ticket files.
- [ ] No check, build, test, migration run, install or git write was run by this ticket. Review evidence comes from inspection.

## EngineOS brief metadata
- Exclusive paths: `packages/core/prisma`, `packages/shared/src/catalog/asset-version.ts`, `packages/shared/src/api/catalog.ts`, `packages/shared/src/api/routes.ts`, `packages/shared/src/asset-jobs`, `packages/core/src/catalog/asset-version.mapper.ts`, `packages/core/src/catalog/asset-version.repository.ts`, `packages/core/src/catalog/asset-purpose.sync.ts`, `packages/core/src/catalog/queries`, `packages/core/src/catalog/commands/create-asset.handler.ts`, `packages/core/src/asset-jobs`, `packages/core/src/agents/asset-purpose-writer`, `packages/core/src/agents/prompts/asset-purpose.prompt.ts`, `packages/core/src/agents/index.ts`, `packages/shared/src/ports`, `apps/watcher/src/asset-jobs`, `apps/api/src/catalog/asset-purpose.controller.ts`, `apps/api/src/catalog/catalog.module.ts`, `apps/api/src/catalog/catalog.controller.ts`, `apps/web/src/features/catalog/components/AssetPurposeCard.tsx`, `apps/web/src/features/catalog/views/AssetDetailView.tsx`, `apps/web/src/messages/catalog`
- dependsOn: none
- Owner: backend-coordinator
- Risk / autonomy: high / A2 (working tree only)
- Acceptance ids: AP-01, AP-02, AP-03, AP-04, AP-05, AP-07, AP-09 (Retry part)
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contracts
