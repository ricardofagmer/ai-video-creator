# 03-core-shared-tests: Unit tests for the R3 pure functions

**What to build:** Evidence for the shared and core R3 logic: the unit tests R3-FP lists for the pure functions, written now and run by the per-ticket test check.

**Blocked by:** 01-core-shared-compile

**Status:** ready-for-agent

## Requirements
- R3-AC-01
- R3-AC-04
- R3-AC-05
- R3-AC-06
- R3-AC-08
- R3-AC-09
- R3-AC-10
- R3-AC-17
- R3-AC-21 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
docs/specs/0006-r3-outside-signals-and-packaging.md section 9 R3-FP and section 12. Test `parsePublicationUrl` (every accepted and refused form of 5.1), `readCsv` and the cell parsers (bounds 2 MiB, 5,000 rows, 64 columns, non-UTF-8, zip), `csvSafeCell` (the six leading characters), `planMetricImport` (same file twice reports created 0 updated 0; dryRun plans nothing to write), `platformSignal` (fewer than 5 eligible videos gives null), `computeQualityScore` v2 (the 5.4 worked example 3.630 and 3.607 without the snapshot; SPEC 0003 worked examples unchanged; `platformSignal: null` equals v1), `nextSlots` and `dueSlots` (weekly across the America/New_York DST change, monthly day 28, once, America/Sao_Paulo), `decideSlot` (unknown month figure skips `month-spend-unavailable`; at or over the ceiling skips `over-month-ceiling`). CSV fixtures are synthetic; profile column names come from `packages/shared/src/metrics/provisional-column-aliases.ts` (Q7 real headers still owed). A test that exposes a bug is fixed in the code inside these paths, never by changing the expectation away from SPEC 0006.

## Acceptance criteria
- [ ] `pnpm --filter @studio/shared --filter @studio/core test` exits 0 with at least one test file per function listed.
- [ ] The 5.4 worked example asserts 3.630 +/- 0.001, sample sizes 4 and 1, and 3.607 after removal (R3-AC-05).
- [ ] A `nextSlots` test crosses a DST change in America/New_York (R3-AC-21).
- [ ] A `decideSlot` test proves no fire with an unknown month figure (R3-AC-17).

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no SQLite database, no real data home and no network: pure functions, in-memory fakes, and `fs.mkdtemp` folders under the OS temp directory for file-based code. Never weaken, skip or `.only` a test.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `packages/shared`, `packages/core`
- dependsOn: 01-core-shared-compile
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
