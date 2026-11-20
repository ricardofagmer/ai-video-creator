# 08-otlp-trace-export: On-demand OTLP JSON trace export (R3-09)

**What to build:** `studio traces export <runId|curationId> --out <file>` writes one OTLP JSON file for a run or a curation, for the owner to load into any OTLP viewer.

**Blocked by:** 03-core-shared-tests, 06-cli-schedules-metrics

**Status:** ready-for-agent

## Requirements
- R3-AC-26 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
docs/specs/0006-r3-outside-signals-and-packaging.md section 9 R3-09; ADR 0006 (on-demand OTLP JSON file, owner answer Q2) and its attribute allowlist. `packages/shared/src/telemetry/**`: a pure mapper from `events.jsonl` and session end lines to OTLP JSON spans, importing no Node module; add the `./telemetry` export to `packages/shared/package.json` (the only manifest edit allowed, an `exports` entry). `tools/cli/src/traces/**`: the command, registered in `tools/cli/src/program/program.ts`. No dependency, no network, no change to any writer.

## Acceptance criteria
- [ ] The mapper emits only attributes on the ADR 0006 allowlist (test).
- [ ] The output parses as OTLP JSON `resourceSpans` with one trace per run or curation (test).
- [ ] The command writes only the `--out` file and refuses an existing file unless the docs say otherwise (test).
- [ ] No `fetch(`, `http` request or new dependency (grep, manifest diff shows only the exports entry).

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no SQLite database, no real data home and no network: pure functions, in-memory fakes, and `fs.mkdtemp` folders under the OS temp directory for file-based code. Never weaken, skip or `.only` a test.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `packages/shared/src/telemetry`, `packages/shared/package.json`, `tools/cli/src/traces`, `tools/cli/src/program/program.ts`
- dependsOn: 03-core-shared-tests, 06-cli-schedules-metrics
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
