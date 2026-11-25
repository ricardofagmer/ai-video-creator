---
name: 2026-11-24-waiting-notice-under-step
status: active
owner: Ricardo Fagmer
spec: none — the change touches 5 files; the developer asked for the move directly and no spec was written
domain: frontend
risk: low
new_feature: false
release: false
security_review: not-required
---

## What
The "Waiting for you" notice (plan approval, preset gates, and every other waiting cause) shows inside the timeline, under the step the run stopped at, instead of at the top of the page.

## Why
The owner asked for the approval to appear below the step that needs it, not at the top.

## Scope
- `packages/ui/src/components/runs/StepTimeline.tsx`, `StepTimeline.module.css`
- `apps/web/src/features/runs/components/RunLiveView.tsx`
- `apps/web/src/features/wizard/components/WizardProduction.tsx`

## What was made
- `StepTimeline` takes `currentStepContent` and renders it inside the current step's row, full width.
- The run page and the wizard's production step pass the waiting notice there. With no known position the notice stays on top, so it is never lost.

## Not done
- A plan approval was not seen in the new place: no run waits on the plan gate. The same notice was seen for a `needs-person` cause.
- The wizard's production step was not opened.
- No tests written.

## Checklist
- [x] Slot under the current step
- [x] Run page and wizard use it
- [x] Seen in the app on 4310

## User checklist
- [ ] Check one run that waits for plan approval.
- [ ] Approve `pnpm lint` and the tests.

## Human decisions
- 2026-11-24, Ricardo Fagmer: asked for the approval below the step, not at the top. No HITL reason id fired.

## Verification
- [validation] pending — final-stage user approval required.
- ran: `pnpm exec tsc --noEmit -p .` in `apps/web` and `packages/ui` exit 0 (2026-11-24).
- Seen in Chrome on 4310 (dev server), run `01M87X4XNHGY1M4591X51BSBC8`: no notice at the top; "Waiting for you" with "Resume" and "Fix" sits under "Composition · Execution".

## Changes registered
Not a git repository; files are listed under Scope.

## Install
- ran: `pnpm exec turbo run build` exit 0, 12 of 12 tasks (2026-11-24).
- ran: `pnpm --filter @studio/shell run package:dmg` exit 1 at the `hdiutil` image step only; the signed app verified ("payload manifest verified: 49675 files match") (2026-11-24).
- Installed in `/Applications/EngineOS Video Creator.app` (payload `builtAt` 2026-11-25T01:26:39.214Z); the old app is in `apps/shell/out/previous-install-20261124222740`. The API answers on 4311 and the watcher is loaded. The installed web CSS carries `stepSlot`. Not seen in the installed app's window: the reinstall ended the web session.
