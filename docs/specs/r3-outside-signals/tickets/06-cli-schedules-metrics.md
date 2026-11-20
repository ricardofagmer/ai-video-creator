# 06-cli-schedules-metrics: CLI: schedules, metrics import, status, doctor (R3-07)

**What to build:** The operator can list, show, pause, resume and delete schedules, import a metrics CSV, and see schedules in `studio status` and `studio doctor`.

**Blocked by:** 01-core-shared-compile

**Status:** ready-for-agent

## Requirements
- R3-AC-08
- R3-AC-23 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
docs/specs/0006-r3-outside-signals-and-packaging.md section 9 R3-07 and design 5.7. `studio schedules list|show|pause|resume|delete`; `studio metrics import <file> --platform <p> --as-of <date> [--dry-run]` through the same `ImportMetrics` handler, reading the file with the same 2 MiB limit; the `status` line (next slot, missed count); the `doctor` checks of 5.7. Commands register in `tools/cli/src/program/program.ts`. Writes only through the Nest handlers; no schedule cursor or slot file is written; pt-BR texts. Leave `tools/cli/src/traces/` absent (ticket 08 owns it). Do not edit `package.json` or `tsconfig*.json`.

## Acceptance criteria
- [ ] `studio schedules pause` then `list` shows `paused` (R3-AC-23, test with fakes).
- [ ] `studio metrics import --dry-run` writes nothing (R3-AC-08, test with fakes).
- [ ] No write to `cursor.json` or `slots.jsonl` under `tools/cli/**` (grep).
- [ ] `studio status` prints the next slot and the missed count (test).

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no SQLite database, no real data home and no network: pure functions, in-memory fakes, and `fs.mkdtemp` folders under the OS temp directory for file-based code. Never weaken, skip or `.only` a test.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `tools/cli`
- dependsOn: 01-core-shared-compile
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
