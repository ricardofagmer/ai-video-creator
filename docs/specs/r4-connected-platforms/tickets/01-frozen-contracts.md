# 01-frozen-contracts: Frozen contracts: shared, Prisma, routes, RUN-FORMAT, ADRs (R4-01)

**What to build:** Every schema, constant, route, file name and table the api, watcher, web and CLI agree on exists once, so the other tickets can run in parallel.

**Blocked by:** none (SPEC 0007 frozen at rev 2, 2026-11-20)

**Status:** ready

## Requirements
- AC 39
- AC 53
- AC 61
- AC 62 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 4.1 to 4.6. Deliver `packages/shared/src/platforms/**` (enums, bounds, file schemas, pure `pollDue`, pure publish-state transitions, pure `capabilityStatus`) and `platforms/files/**` (read, atomic write, O_EXCL create, list, path resolution inside `platform/`, reusing `atomic-write`); ids in `common/ids.ts`; `RunPublicationLineSchema`, `runFileNames.publications` and append/read helpers; `api/platforms.ts`, `api/publishing.ts`, route builders, `API_CONTRACT_REVISION = 7`, `apiRev7ErrorReasons`; the metrics view deltas (`origin`, `polling`); the Prisma models and the hand-authored migration `20261120120000_r4_connected_platforms` (section 4.5); the rev 7 rows in `apps/web/src/lib/api/route-table.ts` (every row except the callback); `docs/RUN-FORMAT.md` sections 4, 25, 26; the ADR 0003 writer rows; new `docs/adr/0007-platform-connections.md` (status `proposed`, with the rejected alternatives of Q1, Q3, Q5).

## Acceptance criteria
- [ ] Every new object is `.strict()`; the pure functions import no Node module; `@studio/shared/platforms` is browser-safe.
- [ ] `MetricSourceSchema`, `ProviderNameSchema`, `EgressEntrySchema` and `run.json` `format` are unchanged; a rev 6 client still parses every rev 6 response.
- [ ] The migration holds only CREATE TABLE, CREATE INDEX and ADD COLUMN and is not executed (AC 61).
- [ ] No schema, column or view carries a token, a title, a caption, a tag or a client secret.
- [ ] No helper accepts a path outside `platform/` or a non-ULID id.
- [ ] The BFF table has every rev 7 row except the callback, with `:platform` and `:attemptId` validated (AC 62).

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 10-final-proof), after the owner's approval. Keep the code testable: inject the clock, the vault, the file root and the platform client.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `packages/shared`, `packages/core/prisma`, `apps/web/src/lib/api/route-table.ts`, `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
- dependsOn: none
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
