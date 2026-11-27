# 03-purpose-owner-edit: Owner edits and regenerates the purpose

**What to build:** On the detail page the owner can edit the text, which then shows an owner-edited mark, and can regenerate it. An owner text is never overwritten automatically.

**Blocked by:** 01-purpose-tracer-bullet

**Status:** ready

## Requirements
- AP-03, AP-10

## Technical details
- `SetAssetPurposeCommand` (body validated as C-P4, 1..280 chars, trimmed, plain text) sets `purposeSource: owner`. Registered in `CatalogModule` only and never in `CatalogReadModule`.
- `PUT .../purpose` route, under the same owner guard as the catalog routes and with object-level access by assetId and version.
- `AssetPurposeEditor` is rendered inside ticket 01's `AssetPurposeCard` through its `editor` slot. It holds the edit, save and cancel controls, and Regenerate calls the generation route. Buttons follow the existing `buttonClassName` variants.

## Acceptance criteria
- [ ] AP-03 as written in the plan.
- [ ] AP-10 as written in the plan.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected requester and model client.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in a production path.
- [ ] No edit outside the exclusive paths, and no edit to the PRD, ADR 0012, the plan or the ticket files.
- [ ] No check, build, test, migration run, install or git write was run by this ticket. Review evidence comes from inspection.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/catalog/commands/set-asset-purpose.command.ts`, `packages/core/src/catalog/commands/set-asset-purpose.handler.ts`, `apps/api/src/catalog/asset-purpose-edit.controller.ts`, `apps/web/src/features/catalog/components/AssetPurposeEditor.tsx`
- dependsOn: 01-purpose-tracer-bullet
- Owner: frontend-coordinator
- Risk / autonomy: high / A2 (working tree only)
- Acceptance ids: AP-03, AP-10
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contracts
