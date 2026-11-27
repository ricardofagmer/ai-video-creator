---
name: 2026-11-24-mock-narration-duration
status: done
completed: 2026-11-24
owner: Ricardo Fagmer
spec: n/a — one-line fix in a mock adapter, Fast change chosen 2026-11-24
domain: llm
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
The mock writer's narration now never exceeds its per-scene word budget, so a mock run lasts the brief's `targetDurationSec`.

## Why
The e2e smoke run 01M86X1P2JQB7NDVXF2NHNPN75 (record `2026-11-24-e2e-pipeline-smoke-script`) was blocked at stage 12 (QA) on the `duration` check: expected 15-25 s, measured 27.50 s.
Root cause: the script had 6 scenes with an 8-word budget each, but the mock opening `Cena simulada N sobre <topic>` was 11 words for the sample topic. 66 words at the mock voice's 2.4 words/s give 27.5 s, matching the measured composition length exactly.

## Scope
- `packages/core/src/agents/adapters/mock-outputs.ts` (`mockNarration`)

## Checklist
- [x] Confirm the root cause from the run's `script.json` and composition duration
- [x] Trim the mock narration to the word budget
- [x] Re-run `scripts/e2e/run-pipeline.sh` and read the outcome

## What was made
- `mockNarration` now returns `words.slice(0, wordCount)`, so a long topic no longer pushes the opening past the budget. For the sample brief this gives 6 x 8 = 48 words, 20 s.

## Not done
- nothing. The DMG image step still fails inside the Claude sandbox (`hdiutil create failed - Device not configured`); the signed app it packages was used directly.

## User checklist
- [x] Redeploy the local app and re-run the e2e smoke.
- [ ] Restart the 4320 `next dev` server if it is in use: the turbo build overwrote `.next`.
- [ ] Commit `packages/core/src/agents/adapters/mock-outputs.ts` when ready.

## Verification
- ran: `pnpm exec turbo run build` (2026-11-24) — 12 successful, 12 total.
- ran: `pnpm --filter @studio/shell run package:dmg` (2026-11-24) — app signed, payload manifest verified (49652 files), `builtAt` 2026-11-24T14:02:51.747Z; DMG step failed in the sandbox as known.
- redeployed: old app moved to `apps/shell/out/previous-install-20261124110355`, new app copied to /Applications, watcher reloaded (running).
- ran: `scripts/e2e/run-pipeline.sh --timeout-min 20` exit 0 (2026-11-24) — run 01M86XYFN4P447C6QDGA2X959J reached review through all 14 stages; `final.mp4` h264 1080x1920 + aac, duration 20.000000 s (previous run: 27.50 s, blocked at QA).

## Human decisions
- 2026-11-24, Ricardo Fagmer: Fast change (supervisor) chosen for this fix.
- 2026-11-24, Ricardo Fagmer: final checks — "Build only", then "Redeploy and re-run" (recorded with `test-ready`).

## Changes registered
- modified: `packages/core/src/agents/adapters/mock-outputs.ts`
