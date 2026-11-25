# 04-purpose-hover-and-copy: Hover shows the purpose, and from-previous keeps it

**What to build:** Every catalog square has `title` = purpose and its thumbnail `alt` = purpose, each falling back as before. A `from-previous` version copies its source's purpose and source and queues no job.

**Blocked by:** 01-purpose-tracer-bullet

**Status:** ready

## Requirements
- AP-08, AP-11

## Technical details
- Put `title` on the card's outer element. Every `img` branch in `CatalogAssetItem` and `CatalogLibraryTile` gets `alt` = purpose, or the current alt text when the purpose is empty. The `SiteEmbed` title is left as it is.
- In `save-asset-version.handler.ts`, the from-previous path copies `purpose` and `purposeSource` and skips the enqueuer. The new-bytes path keeps the enqueue from ticket 01.

## Acceptance criteria
- [ ] AP-08 as written in the plan.
- [ ] AP-11 as written in the plan.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected requester and model client.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in a production path.
- [ ] No edit outside the exclusive paths, and no edit to the PRD, ADR 0012, the plan or the ticket files.
- [ ] No check, build, test, migration run, install or git write was run by this ticket. Review evidence comes from inspection.

## EngineOS brief metadata
- Exclusive paths: `apps/web/src/features/catalog/components/CatalogAssetItem.tsx`, `apps/web/src/features/catalog/components/CatalogLibraryTile.tsx`, `packages/core/src/catalog/commands/save-asset-version.handler.ts`
- dependsOn: 01-purpose-tracer-bullet
- Owner: frontend-coordinator
- Risk / autonomy: high / A2 (working tree only)
- Acceptance ids: AP-08, AP-11
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contracts
