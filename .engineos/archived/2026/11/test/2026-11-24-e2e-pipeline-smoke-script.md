---
name: 2026-11-24-e2e-pipeline-smoke-script
status: done
owner: Ricardo Fagmer
spec: n/a — 2 new files, a test helper script with no product behavior change
domain: test
completed: 2026-11-24
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
An end-to-end smoke script that runs the real studio pipeline on this Mac and shows the real outcome.

## Why
The developer wanted a script that shows what the whole tool really produces, not unit-test results.

## Scope
- `scripts/e2e/run-pipeline.sh` (new)
- `scripts/e2e/sample-brief.json` (new)
- Output lands in `out/e2e/<runId>/`, which `.gitignore` already ignores.

## Checklist
- [x] Map how a run starts (`studio run`), is approved (`studio approve`) and settles (`run.json` state)
- [x] Write the script with a bundled sample brief and a known-good default recipe
- [x] Run it for real and read the outcome

## What was made
- Added `scripts/e2e/run-pipeline.sh`. It checks the prerequisites (`studio`, `node`, `ffprobe`), starts the api and web, and loads the launchd watcher if it is not loaded. It queues a run with `studio run`, answers each in-run gate with `studio approve` (`--no-approve` turns this off), and polls `run.json` until the run reaches review, fails, blocks or times out. It then copies `final.mp4`, `plan.md`, `report.md`, `cost.json` and `run.json` to `out/e2e/<runId>/` and prints the stages, the cost and the ffprobe details of `final.mp4`. Exit codes: 0 pass, 1 fail, 2 blocked on a human, 3 timeout.
- When `--recipe` is not given, the default recipe is taken from the newest run that reached review or was published.
- Added `scripts/e2e/sample-brief.json` (20 s, 9:16, en-US).
- Fixed two problems found while running it: the "Application Support" path broke a shell loop (the scan now runs in node), and a process substitution failed in the sandbox (the stderr filter now uses a temporary file).

## Not done
- The real run did not produce `final.mp4`. It stopped at stage 12 (QA) on the `duration` check: expected 15-25 s, measured 27.50 s. This is a pipeline finding, not a script defect.
- DMG/MSI installer: deferred until the developer asks. MSI needs a Windows port first.

## User checklist
- [ ] Decide on the QA duration failure for run 01M86X1P2JQB7NDVXF2NHNPN75 (retry or override in the web), or fix the pipeline so composition respects `targetDurationSec`.
- [ ] Ask for the installer when ready (DMG now, MSI later).

## Verification
- ran: `scripts/e2e/run-pipeline.sh --timeout-min 20` exit 2 (2026-11-24) — run 01M86X1P2JQB7NDVXF2NHNPN75 went through plan (auto-approved) and stages 5-11, then was blocked at stage 12 QA on the `duration` check (27.50 s vs 15-25 s). The script reported BLOCKED correctly.

## Human decisions
None. No hitl.required fired. Low risk, a local test script.

## Changes registered
- added: `scripts/e2e/run-pipeline.sh`
- added: `scripts/e2e/sample-brief.json`
- movements/renames: none
```
$ git status --short -- scripts/e2e out
?? scripts/e2e/
$ git diff --stat HEAD -- scripts/e2e
(no tracked changes; both files are new and untracked)
```
The working tree carries many unrelated uncommitted changes from other records; they are not part of this one.

## Notes
- `launchctl` and the local services need the script to run outside the Claude sandbox.
