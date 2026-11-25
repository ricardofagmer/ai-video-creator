---
name: 2026-11-25-watcher-stale-tests
status: done
completed: 2026-11-25
owner: Ricardo Fagmer
spec: n/a — test-only repair of stale fakes and assertions, no product behaviour changed
domain: test
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
Updates the watcher tests that still described product behaviour changed on purpose by earlier work, so the 46 failing tests and the 7 test-file type errors can go green. No product code was changed.

## Why
On 2026-11-25 `pnpm test` in `apps/watcher` reported 834 tests, 783 pass, 46 fail, and `tsc -p tsconfig.json --noEmit` reported 7 errors in test files. All four failure groups trace to tests that were not updated when product code changed.

## Scope
Test files only, all under `apps/watcher/src`:
- `daemon/daemon-loop.test.ts`
- `daemon/daemon-loop.platform-steps.test.ts`
- `daemon/__tests__/daemon-world.harness.test.ts`
- `engine/__tests__/review-loop.eval.test.ts`
- `schedules/schedule-step.harness.test.ts`
- `schedules/slot-facts.month-spend.test.ts`
- `stages/__tests__/stage-executors.test.ts`
- `stages/executors/composition-stage.harness.test.ts`

## Checklist
- [x] Diagnose each failure group as stale test or product bug, from source
- [x] Daemon loop fakes supply the asset-job step
- [x] Review-loop test asserts the caveat instead of the removed wait
- [x] Schedule fakes supply `compositionAllowed` and `templateDetails`
- [x] Stage-executor test uses a public http page and supplies `referenceAnalyses`
- [x] `tsc --noEmit` shows 0 errors
- [x] `pnpm test` shows 0 failures

## What was made
Diagnosis, one verdict per group. Every group is a stale test; no product bug was found by reading.

1. `Cannot read properties of undefined (reading 'sweepStale')` (`daemon-pickup`, `end-to-end.eval`, `daemon-loop`, `daemon-loop.platform-steps`). Stale. `DaemonLoop` gained a required ninth constructor parameter, the asset-job step (`daemon/daemon-loop.ts`, guided-creation design section 1), and calls `assetJobs.sweepStale()` at start. The three places that build a `DaemonLoop` in tests passed eight arguments. Each now passes an idle asset-job fake (`sweepStale` does nothing, `claimNext` answers false), so the asserted call orders are unchanged.
2. `revisionsExhaustedFailure is not a function` (`review-loop.eval`). Stale. The function was removed from `stages/agents/review-evidence.ts` on purpose: its header records "Owner decision 2026-11-24: a review never stops the run", and the `script` and `scenes` executors now keep the last draft and call `reviewCaveat`. The test "holds the run waiting for the owner when the revision budget is spent" was replaced by "lets the last draft go on with a caveat when the revision budget is spent", which asserts the kept draft, the `reviewCaveat` text and that `reviewer-score` is not `failed`. The helpers and imports only that test used were removed.
3. `this.recipes.templateDetails is not a function` and the `schedules/` assertion mismatches. Stale. Core `SlotRecipeState` gained `compositionAllowed` and `SlotFactsCollector` now calls `ScheduleRecipeReader.templateDetails` (`packages/core/src/schedules`). The harness `passingFacts` left `compositionAllowed` undefined, so `decideSlot` skipped every slot as `recipe-not-runnable` and tests expecting a fired run got false. `passingFacts` now sets `compositionAllowed: true`; the month-spend test's fake recipe reader now answers `templateDetails: async () => null`.
4. `ZodError` in "stops for the owner when a live capture targets a non-https page". Stale. The test relied on the fixture's `sourceUrl`, `http://127.0.0.1:4399/app`, being refused. `isReadableSourceUrl` (`packages/toolbox/src/providers/media/capture-url.ts`) now reads plain http on a local-network host (owner decision 2026-11-24), so the executor went on to the scripted tool runner and its answer failed parsing. The test now uses `http://app.example.test/tour`, a public http page, which is still refused.
5. Type errors for `StageDependencies` (`stage-executors.test.ts:303`, `composition-stage.harness.test.ts:693`). Stale. `StageDependencies` gained `referenceAnalyses`; both tests now pass `{ readDone: async () => [] }`.
6. Three month-spend tests still failed after the first pass: the real `SlotFactsCollector` logged `schedule.composition-conflict` with rule `stage-needs-binding` and skipped the slot. Stale. The committed fixture recipe (2026-11-18) binds no `voice`, and the composition rules of 2026-11-23 require one for an enabled `narration` stage, matching `planVoice`, which refuses a live narration with no bound voice. The test now adds a voice binding to its copy of the recipe; the shared fixture file was not changed.

## Not done
- No new test covers the asset-job step's order inside the daemon loop; the fakes are idle.
- The brief's one `revisionsExhaustedFailure` failure in `daemon-loop.test.ts` was not found in the source or in any run here.
- The committed fixture recipe `product-tour-16x9@1` still has no `voice` binding, so a schedule pinned to a recipe like it is skipped as `recipe-not-runnable`. That is the rule working as written; whether the fixture should gain a voice is the owner's call.

## User checklist
none — both checks ran green.

## Verification
- ran: `pnpm exec tsc -p tsconfig.json --noEmit` exit 0 (2026-11-25)
- ran: `pnpm test` exit 0 (2026-11-25)
- `pnpm test` in `apps/watcher`, final run: tests 834, suites 135, pass 834, fail 0, cancelled 0, skipped 0.
- Earlier runs the same day: `tsc` first reported 1 error (`composition-stage.harness.test.ts:693`, missing `referenceAnalyses`), fixed. A test run inside the command sandbox reported 118 failures, 138 of its errors being `EPERM ... syscall: 'uv_uptime'` (the sandbox refuses `os.uptime()`); that run is not evidence about the code. The same command outside the sandbox reported 831 pass, 3 fail (group 6 above), then 834 pass after the fix.

## Human decisions
- 2026-11-25 | Ricardo Fagmer | none fired | deferred | Final checks question (typecheck and watcher tests): "Skip for now".
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Same question, asked again at the end of the turn: "Run both", recorded with `test-ready` for `tsc --noEmit` and the `apps/watcher` suite.

## Changes registered
Uncommitted in the working tree. `git status --short` and `git diff --stat HEAD` for this change's eight files (the tree also holds other sessions' changes, not listed; `stage-executors.test.ts` also carries the earlier `runs-warn-never-stop` edit):
```
 M apps/watcher/src/daemon/__tests__/daemon-world.harness.test.ts
 M apps/watcher/src/daemon/daemon-loop.platform-steps.test.ts
 M apps/watcher/src/daemon/daemon-loop.test.ts
 M apps/watcher/src/engine/__tests__/review-loop.eval.test.ts
 M apps/watcher/src/schedules/schedule-step.harness.test.ts
 M apps/watcher/src/schedules/slot-facts.month-spend.test.ts
 M apps/watcher/src/stages/__tests__/stage-executors.test.ts
 M apps/watcher/src/stages/executors/composition-stage.harness.test.ts
 .../daemon/__tests__/daemon-world.harness.test.ts  |   6 ++
 .../src/daemon/daemon-loop.platform-steps.test.ts  |   8 +-
 apps/watcher/src/daemon/daemon-loop.test.ts        |   8 +-
 .../src/engine/__tests__/review-loop.eval.test.ts  | 100 ++++-----------------
 .../src/schedules/schedule-step.harness.test.ts    |   2 +-
 .../src/schedules/slot-facts.month-spend.test.ts   |   7 +-
 .../src/stages/__tests__/stage-executors.test.ts   |  26 +++---
 .../executors/composition-stage.harness.test.ts    |   1 +
 8 files changed, 61 insertions(+), 97 deletions(-)
```

- modified: `apps/watcher/src/daemon/__tests__/daemon-world.harness.test.ts`
- modified: `apps/watcher/src/daemon/daemon-loop.platform-steps.test.ts`
- modified: `apps/watcher/src/daemon/daemon-loop.test.ts`
- modified: `apps/watcher/src/engine/__tests__/review-loop.eval.test.ts`
- modified: `apps/watcher/src/schedules/schedule-step.harness.test.ts`
- modified: `apps/watcher/src/schedules/slot-facts.month-spend.test.ts`
- modified: `apps/watcher/src/stages/__tests__/stage-executors.test.ts`
- modified: `apps/watcher/src/stages/executors/composition-stage.harness.test.ts`
- no renames or moves

## Notes
- `apps/watcher/dist` was not rebuilt and the live watcher was not touched.
- The "runs warn, never stop" behaviour (`2026-11-25-runs-warn-never-stop`) was not changed.
