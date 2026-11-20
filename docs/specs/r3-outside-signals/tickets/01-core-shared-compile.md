# 01-core-shared-compile: Compile shared and core after waves 1-2

**What to build:** R3-01, R3-02 and R3-03 were integrated by inspection only. This ticket makes `@studio/shared` and `@studio/core` typecheck and lint clean, fixing whatever the compiler and eslint report, so every later ticket builds on code that compiles.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Requirements
- R3-AC-01
- R3-AC-04
- R3-AC-05
- R3-AC-10
- R3-AC-13
- R3-AC-17
- R3-AC-18
- R3-AC-19
- R3-AC-20
- R3-AC-21
- R3-AC-24 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
Packages `@studio/shared`, `@studio/core` (`prisma generate` runs inside `typecheck`; it writes the generated client into node_modules and opens no database). Frozen shapes: docs/specs/0006-r3-outside-signals-and-packaging.md sections 4.1-4.6 and `packages/shared/src/api/common.ts` rev 5 (with the six reasons added by the supervisor). Fix types, imports and wiring; keep every exported schema field list as SPEC 0006 section 4.3 states it. Do not edit `package.json`, `tsconfig*.json`, eslint configs or the migration SQL.

## Acceptance criteria
- [ ] `pnpm --filter @studio/shared --filter @studio/core typecheck` exits 0.
- [ ] `pnpm --filter @studio/shared --filter @studio/core lint` exits 0 without new disable comments.
- [ ] The migration `packages/core/prisma/migrations/20261119120000_r3_outside_signals/migration.sql` still holds only CREATE TABLE, CREATE INDEX and ADD COLUMN (R3-AC-24).
- [ ] `SchedulesReadModule` still registers no command handler and `decideSlot` still skips on an unknown month figure (R3-AC-13, 17).

## Testing requirements
No new tests required here (ticket 03 writes them); existing behaviour must not change.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `packages/shared`, `packages/core`
- dependsOn: none
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
