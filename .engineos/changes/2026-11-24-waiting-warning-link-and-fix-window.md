---
name: 2026-11-24-waiting-warning-link-and-fix-window
status: active
owner: Ricardo Fagmer
spec: none — the developer chose "Build directly" over a spec for a change above the spec threshold
domain: frontend
risk: medium
new_feature: true
release: false
security_review: pending
---

## What
The "Waiting for you" warning of a run shows the link it is about and a "Fix" button that opens a window to fix the cause. For brief problems the window edits the run's brief, saves it and resumes the run.

## Why
The owner had to read the warning, leave the page and guess where to fix it. A refused source URL could not be changed on an existing run at all.

## Scope
- `packages/shared/src/run-format/control.ts`
- `packages/shared/src/run-files/run-state-files.ts`
- `packages/shared/src/api/runs.ts`
- `packages/core/src/review/commands/request-run-control.command.ts`
- `packages/core/src/review/commands/request-run-control.handler.ts`
- `apps/watcher/src/engine/run-engine.ts`
- `apps/watcher/src/engine/owner-texts.ts`
- `apps/web/src/features/runs/components/RunFixDialog.tsx` (new)
- `apps/web/src/features/runs/components/RunWaitingNotice.tsx`
- `apps/web/src/messages/runs/{en,es,pt-BR}.ts`

## What was made
- `control.json` and `POST /runs/:runId/control` accept an optional `brief` beside `resume`. The core handler keeps the run's `format` and `language`. The watcher writes the brief into `run.json` when it takes the run and logs one event.
- Warning card: every cause except gates and planner questions shows a link (source URL, catalog item or preset) and a "Fix" button.
- Fix window by cause: brief problems (`needs-person`, `agent-failed`, `revisions-exhausted`, `claim-without-evidence`) edit the brief and resume; asset problems (`license-doubt`, `biometric-asset`) link to the catalog item; `authentication` shows the terminal command, since keys are not typed in the web; `cost-ceiling` links to the preset.

- A corrected brief on resume now reopens the stage that stopped (from its `brief` step); when the Source URL changed, the rerun starts at `research`. Before this, resume re-ran only the check with the old outputs.

## Not done
- The step that stopped keeps its stage `brief.json`; only run.json `brief` changes. Executors read run.json, later stages render a fresh stage brief.
- The server does not re-check the preset's required brief inputs; the web form does.
- No tests written.

## Checklist
- [x] Brief on resume: shared schema, core handler, watcher
- [x] Link and "Fix" button on the warning card
- [x] Fix window for each cause
- [x] End-to-end save and resume against the new API and watcher

## User checklist
- [x] Approve the build of shared, core, API and watcher, and the install or swap.
- [ ] Approve `pnpm typecheck` and `pnpm lint`.
- [ ] Approve the security review: the API now accepts a brief change on an existing run.

## Human decisions
- 2026-11-24, Ricardo Fagmer: approved typecheck and build ("approved and build it"); swap method = "Full package, reinstall".
- 2026-11-24, Ricardo Fagmer: warnings = "Every warning kind"; fix action = "Edit this run, resume"; planning = "Build directly". No HITL reason id fired.

## Verification
- [validation] pending — final-stage user approval required.
- Checked in Chrome on port 4310 (dev server), run `01M880HAN9K1B55ZWS4BYWQV3W`: the card shows "Source URL: http://127.0.0.1:4310/criar" as a link, plus "Resume" and "Fix"; "Fix" opens the "Fix and resume" window with topic, source URL, key messages and target duration filled from the run. "Save and resume" was not pressed.
- Asset, provider and cost windows were not seen: no run waits on those causes.
- ran: `pnpm run typecheck` in `apps/web` exit 0 (2026-11-24).
- ran: `pnpm run typecheck` in `packages/shared` exit 0; in `packages/core`, `apps/api`, `apps/watcher` exit 2, every error in old `*.test.ts` files, none in source (2026-11-24).
- ran: `pnpm exec turbo run build` exit 0, 12 of 12 tasks, after two web lint fixes (unused import in `RecipeFlowSections.tsx`, return type in `messages/wizard/pt-BR.ts`) (2026-11-24).
- ran: `pnpm --filter @studio/shell run package:dmg` exit 1 at the `hdiutil` image step only; the signed app verified ("payload manifest verified: 49676 files match") (2026-11-24).
- Installed: the new app replaced `/Applications/EngineOS Video Creator.app` (payload `builtAt` 2026-11-25T00:38:25.274Z); the old app is in `apps/shell/out/previous-install-20261124213929`. API answers 200 on 4311, the watcher started (pid 50985). The installed files carry `writer@8`, `evaluator@2`, `assetJobsBeforeRun` and `briefCorrected`.
- Proven in Chrome on 4310 after the owner signed in, run `01M880HAN9K1B55ZWS4BYWQV3W`: "Fix" opened the window, Source URL was cleared, "Save and resume" was accepted. The watcher (pid 50985) took the run and logged "Brief corrigido pelo dono antes da retomada"; the card then showed "This run has no source URL." The run passed capture and now waits at Fact check.

## Changes registered
Not a git repository; files are listed under Scope.
- Proven on the third install (payload `builtAt` 2026-11-25T00:57:39.944Z), run `01M880HAN9K1B55ZWS4BYWQV3W` (2026-11-24): "Fix" then "Save and resume" reran the stopped stage 3 from its `brief` step (`verify:execute:2`, `verify:verify:3`), check `claims-evidence` passed, and the run delivered stages 4 to 14 and moved `running -> review`.
