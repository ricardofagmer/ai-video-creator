# 04-watcher-schedule-step: Watcher: schedule step (R3-04)

**What to build:** Between runs the watcher evaluates schedules and fires, misses or skips each due slot; a fired slot becomes one `run.json` at `pending`, which the plan gate then holds like any run.

**Blocked by:** 01-core-shared-compile

**Status:** ready-for-agent

## Requirements
- R3-AC-12
- R3-AC-13
- R3-AC-14
- R3-AC-15
- R3-AC-16
- R3-AC-17
- R3-AC-19
- R3-AC-20 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
docs/specs/0006-r3-outside-signals-and-packaging.md section 9 R3-04 and design 5.6; ADR 0003 writer rows as amended by R3-01. Use `SchedulesReadModule`, `ScheduledRunFactory`, `decideSlot`, `dueSlotSplit`, `SlotFactsCollector`, `ScheduleRunsReader.findRunForSlot` and `ScheduleStore` from `@studio/core/schedules`; files through `@studio/shared/schedules/files`. Hook the step into `DaemonLoop` before `curations.claimNext()`. Inject the existing `CLOCK` token. `lateGraceMs` 2 h; missed slots are logged and never replayed; a crash between the run write and the slot line must not create a second run for that slot.

## Acceptance criteria
- [ ] No Prisma write call in `apps/watcher/**` (grep).
- [ ] The only run-folder write is a single `run.json` at `pending`; no `approval.json` or `control.json` write (R3-AC-12, 13).
- [ ] The watcher never writes `schedule.json` (R3-AC-19).
- [ ] With the clock moved 3 days forward, a daily schedule logs 2 or 3 `missed` lines and fires at most one run (R3-AC-15, test).
- [ ] A busy loop at the slot instant fires late within `lateGraceMs`, else logs `missed` / `watcher-busy` (R3-AC-14, test).
- [ ] A paused or deleted schedule fires nothing, and resume replays nothing (R3-AC-20, test).
- [ ] Unknown month spend skips with `month-spend-unavailable` (R3-AC-17, test).

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no SQLite database, no real data home and no network: pure functions, in-memory fakes, and `fs.mkdtemp` folders under the OS temp directory for file-based code. Never weaken, skip or `.only` a test.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `apps/watcher`
- dependsOn: 01-core-shared-compile
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
