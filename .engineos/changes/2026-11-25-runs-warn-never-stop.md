---
name: 2026-11-25-runs-warn-never-stop
status: active
owner: Ricardo Fagmer
spec: n/a — owner chose "Fast change (supervisor)" on 2026-11-25
domain: backend
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
A run no longer stops on failed quality checks, claims without evidence, a cost ceiling, an unanswered plan gate or planner questions. Each of these now leaves a warning the owner sees and the run goes on.

## Why
Run `01M899E922VAXRV5SZW809M136` (preset `product-tour-16x9@2`) ended `failed` at stage 12 (qa), step verify: duration 42.30 s against 45-90 s and true-peak -0.8 dBFS against <= -1 dBFS. The video existed and was usable. Owner, 2026-11-25: "the system should remove any block, the pipeline should never stop, only create warning to the user sees".

## Scope
- `apps/watcher/src/engine/seams.ts`
- `apps/watcher/src/engine/failure/recovery.policy.ts`, `step-failure.handler.ts`
- `apps/watcher/src/engine/stage-runner.ts`, `engine.errors.ts`, `owner-texts.ts`
- `apps/watcher/src/engine/control/step-guard.ts`, `run-control.service.ts`
- `apps/watcher/src/engine/cost/run-spend.ts`, `cost-ceiling.check.ts`
- `apps/watcher/src/engine/steps/preflight.step.ts`
- `apps/watcher/src/engine/gates/gate-keeper.ts`, `plan-recorder.ts`
- `apps/watcher/src/stages/executors/package.executor.ts`, `stages/package/qa-summary.builder.ts`, `stages/shared/stage-texts.ts`
- Tests: `apps/watcher/src/engine/cost/cost-ceiling.check.test.ts`, `stages/__tests__/stage-executors.test.ts`, `test-support/mock-engine.test.ts`

## Checklist
- [x] Failed checks: automatic repair first, then the step ends `warning`
- [x] Claims without evidence follow the same path
- [x] Cost ceilings warn instead of holding the run
- [x] Unanswered plan gate and planner questions warn instead of holding the run
- [x] Package accepts a video QA did not pass and lists the failed checks as warnings
- [x] Build (tsc) and proof on the failed run
- [x] Tests that asserted the old stops updated (9 tests in 3 files)
- [ ] Watcher suite green (46 failures remain from other causes)

## What was made
- New failure decision `accept`. `RecoveryPolicy` turns a `fail-run`, or a wait for a person raised by the repair, into `accept` when the failure is failed checks. The handler ends the step `warning` with the failed check ids. The repair attempts (verify repeat, Recovery calls, stage reruns) still run first, inside the same limits.
- `verify` is exempt from the attempts precheck in `StageRunner`, so a resumed or rerun stage measures once more and is accepted instead of failing before the step runs.
- The `claims-evidence` never-retried wait is removed.
- `CostCeilingCheck` returns a passed verdict with a caveat, so `preflight` ends `warning` with both amounts. Spend past the run ceiling between steps is logged once per execution as a warning. `StepGuard` no longer aborts a step on spend. The cost wait builders and the `cost-ceiling` interruption are deleted.
- `GateKeeper` logs a warning for an unanswered gate and opens it. A recorded rejection still ends the run `rejected`. `PlanRecorder` logs a warning for planner questions and continues.
- `PackageExecutor` no longer refuses a video whose QA did not pass. `qaSummaryOf` adds one warning per failed or errored check, with expected and measured values.

## Not done
- Still stops, by design or because nothing exists to continue with: a stage that writes no output, an executor error that asks for a person (missing input, blocked capture), authentication refused by a provider, a third-party asset with no licence, a failure on a stage that uses a cloned-voice asset, an owner stop or pause, a rejected gate, missing final files before review, a watcher internal error.
- A run still ends in `review`. That is the finished state with the video ready; approval there is recorded by the app and was not changed.
- The web texts for waiting on a gate, cost or planner questions are unchanged and are now unreachable for new runs.
- `limits.costPerRunUsd` and `costPerMonthUsd` no longer protect spend. Only the warning remains.
- No new test covers the `accept` decision of `RecoveryPolicy`, the `verify` precheck exemption, the once-per-execution spend warning or the planner-questions warning. The updated tests cover the cost verdict, the package executor and the plan gate.
- 46 watcher tests fail for causes this change did not touch (see Verification). They were not fixed.
- PRD 7.3, SPEC 0002 (K2, K3, K4, A6) and the topology text still describe the old stops.

## User checklist
- [x] Approve updating and running the watcher tests.
- [ ] Decide what to do about the 46 failing watcher tests from other work.
- [ ] Decide whether the specs should be amended to match.

## Verification
- Tests, 2026-11-25, `pnpm test` in `apps/watcher` (owner: "Yes, fix tests"). First run: 833 tests, 773 pass, 55 fail. Nine failures came from this change: 7 in `cost-ceiling.check.test.ts`, 1 in `stage-executors.test.ts` ("QA did not pass"), 1 in `mock-engine.test.ts` (plan gate). Those tests now assert the warning behaviour. Second run: 834 tests, 783 pass, 46 fail.
- The 46 remaining failures, by first error: `Cannot read properties of undefined (reading 'sweepStale')` in `daemon-pickup`, `end-to-end.eval`, `daemon-loop` and `daemon-loop.platform-steps`; `revisionsExhaustedFailure is not a function` in `review-loop.eval` and `daemon-loop`; `this.recipes.templateDetails is not a function` and assertion mismatches in `schedules/`; a `ZodError` in `stage-executors` ("non-https page"). None of these names is touched by this change. That they predate it is read from the error causes; no clean checkout was run to confirm.
- `tsc --noEmit` over the watcher including tests reports 7 errors, none in the three test files edited here.
- Build, 2026-11-25: `pnpm exec turbo run build --filter=@studio/watcher` printed "Tasks: 6 successful, 6 total" (tsc), twice (after the main edit and after the wording fix).
- Proof, 2026-11-25: `studio resume 01M899E922VAXRV5SZW809M136`. The run went from `failed` to `review`. Stage 12 (qa) verify ended `warning` after two more `rerun-previous-stage` recoveries; stages 13 and 14 delivered. `qa/summary.json`: outcome `passed-with-warnings`, warnings "duration reprovada: esperado 45-90 s, medido 42.30 s." and "true-peak reprovada: esperado <= -1 dBFS, medido -0.8 dBFS.". `final.mp4` 13.1 MB, 42.30 s (ffprobe). Recorded cost US$ 0.12.
- Not proven on a real run: the cost ceiling warning, the unanswered plan gate and the planner questions path. They compile; no run has exercised them yet.
- The step warning wording was changed after the proof run (the postcondition prefix was dropped); the new wording has not appeared in a run yet.

## Human decisions
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Scope: "Failed quality checks", "Claims without evidence", "Cost ceiling pause", "Plan approval and final review". The cost option stated "This removes your money safety net."
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Auto-fix: "Try fix, then warn".
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Planning: "Fast change (supervisor)".
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Proof: "Yes, resume it" for run `01M899E922VAXRV5SZW809M136`.
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Tests: "Yes, fix tests", recorded with `test-ready` for the `apps/watcher` suite.

## Changes registered
Uncommitted in the working tree. Files as listed under Scope.

## Notes
- The watcher runs from the workspace build (`apps/watcher/dist/main.js`), restarted twice on 2026-11-25 to load this change. The installed app in /Applications still has the old behaviour.
