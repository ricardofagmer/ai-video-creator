# 02-purpose-content-readers: Writer reads the asset's own content

**What to build:** For prompts, skills and templates the writer also reads the bounded entry text. It reads stored images through vision, and video references with a `done` analysis through that analysis. Music, SFX and link-only rows stay metadata only.

**Blocked by:** 01-purpose-tracer-bullet

**Status:** ready

## Requirements
- AP-06

## Technical details
- Read entry text through the existing `GetEntryFileTextHandler`, bounded at 12 000 chars. Read image bytes through the catalog resolver, ≤ 5 MB, from a stored image only and never from a link. Read the analysis through `ReferenceAnalysisReader`.
- Re-check biometric on the row and on the real path, as reference analysis does. A biometric row never reaches `purposeInput`.
- Logs carry the ref, kind, counts and codes. They never carry content or a path.

## Acceptance criteria
- [ ] AP-06 as written in the plan.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected requester and model client.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in a production path.
- [ ] No edit outside the exclusive paths, and no edit to the PRD, ADR 0012, the plan or the ticket files.
- [ ] No check, build, test, migration run, install or git write was run by this ticket. Review evidence comes from inspection.

## EngineOS brief metadata
- Exclusive paths: `apps/watcher/src/asset-jobs/asset-purpose.input.ts`, `apps/watcher/src/asset-jobs/asset-purpose.content.ts`
- dependsOn: 01-purpose-tracer-bullet
- Owner: llm-coordinator
- Risk / autonomy: high / A2 (working tree only)
- Acceptance ids: AP-06
- Contracts: `.specs/features/catalog-asset-purpose/plan.md` rev 1 (C-P1..C-P6), `docs/adr/0012-asset-purpose-text.md`, `docs/prds/2026-11-25-catalog-asset-purpose.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contracts
