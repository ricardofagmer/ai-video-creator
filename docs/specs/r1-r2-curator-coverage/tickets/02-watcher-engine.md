# 02-watcher-engine: Watcher engine tests and loop evals

## Description
The run engine's behaviour is pinned by tests: state transitions, step lifecycle, `control.json`
pause, stop and resume, fault scenarios, crash-resume at engine level, and the four topology v1
loop evals on `ReviewVerdict`.

## Requirements
CR2, CR13

## Technical details
- Code under test: `apps/watcher/src/engine/` (`run-engine.ts`, `transitions.ts`, `stage-runner.ts`,
  `control/`, `failure/`, `gates/`, `run-budget.ts`, `review-readiness.ts`).
- Uses `startMockEngine`, `createWatcherHome`, `stubProcessIdentity` from
  `apps/watcher/src/test-support` (contract `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1`
  section 8.2), read-only.
- Files: `apps/watcher/src/engine/__tests__/transitions.test.ts`, `control.test.ts`,
  `faults.test.ts`, `crash-resume.test.ts`, `budget.test.ts`, `review-loop.eval.test.ts`.
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. Every allowed transition in `transitions.ts` has a passing case and at least one forbidden
   transition is refused with its typed error.
2. `pause: true` finishes the current step then ends `paused`; `pause: false` cancels a pending
   pause; `stop` leaves the step `pending` and the run `interrupted`; stop wins over pause.
3. Each fault switch the watcher declares reaches its documented end state (`verify-check-failure`
   recovers to `review`; `step-failure` ends `failed`, criterion 15).
4. A simulated SIGTERM mid-step resumes from the last completed step without redoing it
   (criterion 13, engine level).
5. `review-loop.eval.test.ts` holds 4 cases: retry only with `retryRecommended` and a non-empty
   `retryInstruction`; at most 2 revisions; an exhausted budget gives `waiting`; a Reviewer failure
   gives a warning (topology 0001 section 11, loop row).

## Testing requirements
Author the six files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under `apps/watcher/src/engine/__tests__`.
2. No real provider, network, Keychain or home directory access; every test calls `shutdown()`.
3. Any test that fails because product code is wrong is kept and reported with file and line.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `apps/watcher/src/engine/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8.2, consumer)
