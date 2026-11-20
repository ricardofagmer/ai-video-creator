# 05-api-metrics-schedules: Api: publications, metrics and schedules routes (R3-05)

**What to build:** The owner records publications, types metrics, imports platform CSVs and manages schedules through the C10 rev 5 routes.

**Blocked by:** 01-core-shared-compile

**Status:** ready-for-agent

## Requirements
- R3-AC-01
- R3-AC-02
- R3-AC-03
- R3-AC-08
- R3-AC-09
- R3-AC-11
- R3-AC-18
- R3-AC-19
- R3-AC-22 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
docs/specs/0006-r3-outside-signals-and-packaging.md section 9 R3-05, sections 4.4, 5.1-5.3, 5.5, 5.7. `apps/api/src/metrics/` (controllers, multipart receive with `busboy` already in dependencies, held in memory with the 5.3 limits, never written to disk), `apps/api/src/schedules/` (controller, slot-tail reader, fired-run index sync), error mapping for every `apiRev5ErrorReasons` row with its status, modules in `app.module.ts`. `recorded_by`, `imported_by` and `correlationId` come from the session and `x-request-id`. No new dependency; a needed one is a blocker.

## Acceptance criteria
- [ ] Every route of SPEC 0006 4.4 is mounted and validates input with the shared schemas.
- [ ] Every `apiRev5ErrorReasons` reason maps to its status code (test).
- [ ] The upload is never written to disk; no route sets a run status; no import from `@studio/core/agents` (grep).
- [ ] The api never writes `cursor.json` or `slots.jsonl` (R3-AC-19, grep).
- [ ] `POST /schedules` without consent equal to the per-run ceiling answers 409; an 11th schedule answers 422 (R3-AC-18, test with fakes).
- [ ] A fired run appears in `GET /runs` on the next request without a restart (R3-AC-22, test with fakes).

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no SQLite database, no real data home and no network: pure functions, in-memory fakes, and `fs.mkdtemp` folders under the OS temp directory for file-based code. Never weaken, skip or `.only` a test.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `apps/api`
- dependsOn: 01-core-shared-compile
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
