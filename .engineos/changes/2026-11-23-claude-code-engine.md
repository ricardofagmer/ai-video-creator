---
name: 2026-11-23-claude-code-engine
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-23-claude-code-engine-design.md
domain: backend
security_review: pending
preview: declined
risk: medium
new_feature: true
release: false
---

## What
Add the Claude Code CLI installed on the Mac as a third engine for the studio's agents, beside
mock and the Claude API, and prove it with one run started in the studio.

## Why
The owner finds the Claude API too expensive and wants runs to use the Claude Code subscription
(2026-11-23).

## Scope
Design gate so far: `docs/adr/0011-claude-code-engine.md`,
`docs/specs/2026-11-23-claude-code-engine-design.md`. Planned code surfaces are the four tickets
in the spec.

## Checklist
- [x] Owner answers on engine, first step and test scope
- [x] Proof call through `claude -p` with the planner prompt and schema (valid, 8.3 s)
- [x] ADR 0011 and spec drafted
- [x] Owner approval of ADR 0011 and the spec
- [x] Owner confirmation that the organization account may be used
- [x] Prototype preview choice answered (declined, scope rev 1)
- [x] Tickets 1 to 3 written, built (api, watcher, cli), not tested
- [x] Repo watcher started on the real data home with the engine (start-up check passed), then stopped; installed watcher restored
- [x] Ticket 4: run 01M85N270YJ3QT2G3SA903YFPF started with the studio CLI reached `review` with `final.mp4`
- [x] Owner confirmed run 3's video plays in the app ("It plays", 2026-11-23)
- [x] Cart video from the app in Chrome: run 01M85PPVDBNDMA086HBT3ZK4F8 reached `review` and plays on its review page
- [ ] Final checkpoint and security review

## What was made
- ADR 0011 and the spec.
- Ticket 1: `packages/core/src/providers/claude-engine.config.ts` (new), and the engine rule in
  `provider-mode.service.ts`, `providers.module.ts`, `providers.errors.ts`, `index.ts`.
- Ticket 2: `packages/core/src/agents/adapters/claude-code-cli.ts`, `claude-code-envelope.ts`,
  `claude-code.adapter.ts` (all new).
- Ticket 3: adapter selection and start-up check in `agents.service.ts`, registration in
  `agents.module.ts`, USD 0 for this engine in `costs/cost-ledger.service.ts`.
- Outside the ticket list: `agents/curator/curator-agent.service.ts` skips its start-up key check
  under this engine, so the start is not blocked. The Curator itself is not served by the engine.
- Found by the run (ticket 3 gap): agent stages estimated USD at API bounds under this engine, so
  the run cost ceiling stopped run 1 before the planner. `apps/watcher/src/stages/shared/
  base-stage.executor.ts` gained `agentCallsBilled()`, `stage-dependencies.ts` an optional
  `usesClaudeCode`, and the plan, research, script, scenes and agent-review executors estimate
  USD 0 on this engine.
- Found by the run: `packages/core/src/agents/prompts/writer.prompt.ts` is `writer@6` with a word
  budget from the target duration. This is behaviour for every engine, not only this one, and the
  site-analysis spec still names `writer@5`.
- Found by the cart run, outside this change's tickets (writer-skills code): `packages/core/src/
  catalog/catalog-read.module.ts` did not register `GetEntryFileTextHandler` or
  `SkillEntryFileService`, so the watcher crashed at the script stage on any recipe with a writer
  skill ("No handler found for the query GetEntryFileTextQuery"). Both are registered there now.
- Catalog and recipe data made through the app for the cart run (data home, not the repo): asset
  `meeting-notes-thumbnail@1`; `ig-dfdrn7xgi3g@2` with the owner's licence note; `writer-prompt@1`,
  `elevenlabs-voice@1`, `fagmer-brand@1` and `spesia-music-680@1` activated; recipe
  `cart-demo-9x16` versions 1 to 3.

## Not done
- The skill fix in the installed app is not proven by a run: mock run 01M85QFS7ZJENAP4YHPD9NA528
  waits at its plan gate (owner: "Skip the proof").
- The `.dmg` image was not produced by the repackage (`hdiutil create` failed, "Device not
  configured"); only the app bundle was built and installed.
- Cart behaviour seen and not changed: "Aplicar o carrinho" bound the writer prompt to the planner
  slot; a recipe made from the cart can be saved without the writer prompt, brand kit and music
  that the script, scenes and music stages then stop on; a stopped run stays tied to the asset
  version it started with.
- In the cart run the agent review ended "Concluido com recuperacao" with scenes scored 1 and
  render 3; the planner noted the Instagram reference was not in its packet. Not investigated.
- No lint or test has run on this code.
- The run was started from the terminal, not from the app's own start screen (the owner's two
  attempts there produced no run request; cause not investigated).
- Voice and capture were mock in the proof run. Stage 14 reads `pending` in `report.md` while
  `run.json` counts 14 stages delivered; not investigated.
- The rendered title card shows a dim line of text behind the title (seen at 6 s); not investigated.
- Tests for tickets 1 to 3.
- The Curator and the typed tools under this engine.

## Verification
- Proof call: exit 0, `structured_output` passed `PlanOutputSchema`, model `claude-sonnet-5-5`.
- Typecheck `@studio/core`: one error, `src/seed/__tests__/seed.test.ts(92,7)` TS2554, from
  another session's catalog change; no error in this change's files.
- Build `@studio/api`, `@studio/watcher`, `@studio/cli` through turbo: 8 of 8 tasks successful
  (web not built).
- Repo watcher on the real data home (pid 20198): log shows `claude` live with engine
  `claude-code`, `agents.claude-code-available` (2.1.329), `watcher.loop-started`.
- Installed watcher restored through launchd (pid 20684): running, holds the lock, all providers
  mock.
- Second swap (repo watcher pid 23725): same start-up evidence; the api log shows no run-creation
  request and no new run folder appeared, so it processed no run. Installed watcher restored
  again (pid 24902): running, holds the lock, all providers mock. Its log lines now carry the
  `engine` field, so the installed payload was rebuilt from this tree by another change in the
  meantime and already contains this code (engine off there: no provider settings in its plist).
- Run 1 (01M85MP8PGQN2NH57EM7F71MEB): stopped at preflight, cost ceiling, estimate USD 3.40 over
  USD 3.00. Fixed as above; watcher typecheck clean, watcher build 6 of 6 tasks.
- Run 2 (01M85MVAFE5K5YSGC3SXRXHJ1J): planner, writer, director, evaluator and recovery sessions
  all `live: true` on `claude-opus-5-5` / `claude-sonnet-5-5` at USD 0; two HyperFrames renders;
  failed stage 12 qa, duration 12.93 s against 15-25 s (31 narration words). Fixed by `writer@6`.
- Run 3 (01M85N270YJ3QT2G3SA903YFPF): `review`, 14 stages delivered, 8 sessions, 32 checks, 0
  failures, `costUsd` 0; cost.json records 21,446 input and 6,505 output tokens; 6 egress lines;
  `final.mp4` 18.77 s, h264 1080x1920 30 fps with aac audio.
- Installed watcher running again under launchd (pid 29134), holds the lock, all providers mock.
- Cart run, started in the installed app's web UI in Chrome with the repo watcher (pids 30547, then
  32962 after the fix): 01M85NQ6K2R5SH6C8G852Y26RX stopped at preflight (third-party reference
  without licence); 01M85NY57ECT10VQKR39NV3D33 stopped at script (no writer prompt bound);
  01M85P4FQWA12YX3A6KASHPE6B failed at script (missing query handler, fixed); 01M85PBWAP70GDYJNFD56DWCZ5
  stopped at scenes (no brand kit bound); 01M85PPVDBNDMA086HBT3ZK4F8 on `cart-demo-9x16@3` reached
  `review`: 14 stage folders, 8 model sessions, `totalUsd` 0, `final.mp4` 21.7 s h264 1080x1920
  30 fps with aac. On its review page in Chrome the video element reported duration 21.7 and was
  playing at 3.96 s (muted by the check).
- Watcher build after the fix: turbo 6 of 6 tasks successful. No test run.
- Installed watcher restored (pid 35243): running, holds the lock, all providers mock.
- Repackage and reinstall: turbo build 12 of 12 tasks; `package:dmg` built and ad hoc signed the
  app ("verified 31 nested signature(s)", "payload manifest verified: 49434 files match"), then
  failed at the disk image. The built app replaced `/Applications/EngineOS Video Creator.app`
  (previous bundle moved to the session scratchpad, not deleted); `codesign --verify --deep
  --strict` exit 0; the installed `catalog-read.module.js` registers `GetEntryFileTextHandler`;
  watcher pid 40907 holds the lock with all providers mock; web and api answer 200. The api
  restart ended the browser session.
- [validation] pending — lint, tests and security review are not done

## Human decisions
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Engine: "Add as third engine (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | First step: "Proof first, then ADR (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Test scope: "Claude Code + real render (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Design review of ADR 0011 and the spec: "Approve design (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Organization account (Instituto Biosistemico): "Yes, use this account"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Prototype preview, scope rev 1: "No preview, start building (Recommended)" (declined)
- 2026-11-23 | Ricardo Fagmer | policy-conflict | deferred | Typecheck of `@studio/core`: "Skip for now"; validation pending
- 2026-11-23 | Ricardo Fagmer | policy-conflict | deferred | Live run (ticket 4): "After site-analysis finishes (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Typecheck, build and live run: "Yes, go ahead"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Where to run: "Real app, swap the watcher"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | "Restore watcher": installed watcher put back before a run was started; ticket 4 stays open
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | "Swap and run": second watcher swap
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | "Restore watcher" (second time): no run request reached the api; ticket 4 stays open
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | "Run from terminal": third watcher swap, runs created with the studio CLI
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Plan gate of run 2: "Approve the plan (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | After the QA failure: "Fix the writer's pacing (Recommended)"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Plan gate of run 3: "Approve the plan (Recommended)"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Run 3's video in the installed app: "It plays"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Instagram reference: "the video reference is only to get the model, effects and not to copy"; licence note on `ig-dfdrn7xgi3g@2`: "Save this record (Recommended)"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Plan gates of runs 01M85NY5, 01M85P4F, 01M85PBW and 01M85PPV: "Approve as is (Recommended)" / "Approve the plan (Recommended)", one answer per run
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Catalog: "Activate prompt and voice (Recommended)"
- 2026-11-23 | Ricardo Fagmer | policy-conflict | approved | Missing skill-text handler: "Fast change: fix it (Recommended)"
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Recipe v3: "Brand kit and music" (both activated)
- 2026-11-23 | Ricardo Fagmer | external-effect | approved | Installed app: "Yes, rebuild it", then "Full repackage, reinstall (Recommended)"
- 2026-11-23 | Ricardo Fagmer | external-effect | declined | Mock proof run 01M85QFS on the installed watcher: "Skip the proof"

## Changes registered
Pending.

## Notes
Scope revision `rev1`. Amends ADR 0002. The working tree already holds uncommitted changes from
the desktop-installer change, including `script.executor.ts` and `scenes.executor.ts`; this
change's tickets do not touch those files. A third change, site-analysis, is being written in the
same tree at the same time and edits `packages/core/src/agents/` (roster, prompts, packets); it
did not edit the files listed above when this was written.
