---
name: 2026-11-25-plan-risk-flags
status: active
owner: Ricardo Fagmer
spec: n/a — owner chose "Fast change (supervisor)" on 2026-11-25
domain: llm
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
The plan gate stops showing five risks the owner called noise or wrong, and the cause behind two of them is fixed: videos up to 10 minutes can render, and prompts saved in the wrong agent's slot are put right when a run starts.

## Why
Run `01M888DYPF9XH8HRBJWDE1Y54Y` (preset `carrinho-completo-9x16@5`) listed: target duration equal to the 30 s maximum, `claims-evidence` with research and verify off, swapped prompt slots, a cost-variation note and a narration-length note. Owner answers on 2026-11-25: duration goes to 10 minutes; the claims and narration notes are not needed; swapped slots are corrected automatically, always; the cost note is never a warning.

Found while tracing:
- The run pinned preset v5 (30 s, `title-card-hf-template@3`). Preset v8 and the template versions made in the app on 2026-11-25 already state 3-600 s, but their stored files still declare a fixed 30 s composition and variables capped at 30, so a narration over 30 s would be refused at render.
- HyperFrames renders the whole declared length and the picture is cut afterwards. A fixed 600 s composition would render 600 s for every video.
- Preset v5 holds `prompt:planner = writer-prompt@1` and `prompt:writer = director-prompt@1`. The cart fill was fixed on 2026-11-24; saved presets were not.

## Scope
- `packages/core/src/agents/prompts/planner.prompt.ts`
- `packages/shared/src/recipes/prompt-slots.ts` (new), `packages/shared/src/recipes/index.ts`
- `packages/core/src/runs/run-draft.service.ts`
- `apps/web/src/features/cart/cart-bindings.ts`
- `apps/watcher/src/stages/composition/hyperframes-composition-length.ts` (new), `apps/watcher/src/stages/executors/composition.executor.ts`
- `seeds/templates/hyperframes/title-card/`, `seeds/templates/hyperframes/scene-cards/`, both `*.input.schema.json`, `seeds/catalog.seed.json`

## Checklist
- [x] Planner prompt `planner@3`
- [x] Prompt slot correction at run start
- [x] Composition length follows the narration
- [x] Seed templates accept 3-600 s
- [x] Catalog seed: `title-card-hf-template@5` and `scene-cards-hf-template@4` created as draft
- [x] Activation in the app: `title-card-hf-template@5` and `scene-cards-hf-template@4` active (approvals 12 and 13)
- [x] Preset re-pin: `carrinho-completo-9x16@10` pins `title-card-hf-template@5`
- [x] Build (tsc) of the changed packages and a proof run over 30 s
- [ ] Tests (none written for the two new modules; owner deferred)

## What was made
- `planner@3`: `risks` lists only what can stop or degrade the run and the owner can act on. The prompt names the five subjects it must not raise as risks. A total above the run limit or the month headroom is still one risk with both amounts. The cost estimate stays visible as the plan's total; it has no separate message field.
- `recipeWithPromptSlotsCorrected` (shared): a prompt whose asset id names an agent moves to that agent's slot when the slot is free and is dropped when the slot already holds a prompt. `RunDraftService.create` applies it before the binding and composition checks, so the run's pinned definition carries the corrected slots. The saved preset version is not changed. `promptSlotOf` moved from the web cart to shared; the cart imports it.
- `fitStagedCompositionLength` (watcher): before a HyperFrames render, the staged copy's `index.html` gets `data-duration` set to the narration length in whole seconds, on the composition and on every element declared with the composition's length. The background clip is built to the same length instead of the template maximum. The stored template is never written.
- Seed templates `TitleCard` and `SceneCards`: `data-duration` 600, variable maxima and defaults 600, CSS fallbacks 600, catalog `duration` 3-600 s.

## Not done
- Preset `carrinho-completo-9x16@10` keeps the swapped prompt slots as saved (`prompt:planner = writer-prompt@1`, `prompt:writer = director-prompt@1`); the run-start correction puts them right once the new code is installed.
- `carrinho-completo-9x16@9` is an accidental save identical to v8 (still `title-card-hf-template@4`): the first attempt's template choice did not reach the form state. It is a draft and is left in place; runs must use v10.
- The seed's four music entries failed with `SeedSourceMissingError`, as on earlier seeds (source files absent). Not part of this change.
- Since 2026-11-25 the api and the watcher run from the workspace build (owner's choice, no installer); the installed app in /Applications still has the old payload and its launch agent `com.videostudio.watcher` is unloaded. Reopening the installed app or logging in again may bring the old services back. The installed web on 4310 is unchanged (its only change here is a refactor).
- No test was written for the two new modules; tests wait for the final gate.
- Deviation from SPEC 0008 U1 (composition length fixed at 30 s), approved by the owner below. The spec text is not amended.
- `video-studio-deps` and `video-studio-zod4` copies were not touched.

## User checklist
- [x] Approve the catalog seed against the local data home.
- [x] Activate `title-card-hf-template@5` and `scene-cards-hf-template@4`.
- [x] Re-pin the preset to `title-card-hf-template@5`.
- [ ] Approve typecheck and tests.
- [ ] Rebuild and reinstall the app, or use the dev server, before the next run.

## Verification
- [validation] pending — final-stage user approval required.
- Build, 2026-11-25: `pnpm exec turbo run build --filter=@studio/api --filter=@studio/watcher` printed "Tasks: 7 successful, 7 total" (tsc clean for shared, core, hyperframes, api, watcher). Tests not run. Services after the swap: api pid 41045 from `apps/api/dist/main.js`, `/health` `{"status":"ok","database":"ok"}`; watcher pid 41159 from `apps/watcher/dist/main.js`, log `watcher.loop-started`. Built files contain `planner@3`, `fitStagedCompositionLength` and `recipeWithPromptSlotsCorrected`.
- Proof run, 2026-11-25: `01M898YA9HN8QWRW74Z0D3WBHB`, preset `carrinho-completo-9x16@10`, brief target 60 s. Plan: `risks: []` ("Nenhum risco apontado"), no questions, estimate US$ 0.699. Pinned bindings: `prompt:writer = writer-prompt@1`, `prompt:director = director-prompt@1`, `template = title-card-hf-template@5`. Narration 63.81 s; `composition.mp4` 63.83 s; `final.mp4` 63.83 s (ffprobe). Composition execute step took 51.5 s. 14 stages delivered, 0 failures, recorded cost US$ 0.16, run now in `review`. The agent review gave overall score 2; content quality is outside this change.
- Seed, 2026-11-25: `node tools/cli/dist/main.js catalog seed --source-root /Users/ricardofagmer/projects/ai-video-creator` printed "Total: 2 criados, 29 sem mudança, 4 com falha", exit 7. Read back from the database: both new versions are `draft` with duration 3-600 s; the stored `index.html` of `title-card-hf-template@5` declares `data-duration="600"` twice. Backup taken first: `studio.sqlite.pre-seed-2026-11-25` with `-wal` and `-shm`, beside the database.

## Human decisions
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Duration: "New template version, 3-600 s".
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Planning: "Fast change (supervisor)".
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Render length: "Length follows narration", after being told a fixed 600 s composition renders 600 s per video (estimate, not measured).
- 2026-11-25 | Ricardo Fagmer | none fired | deferred | Final checks: "Skip for now". Typecheck and tests stay pending.

- 2026-11-25 | Ricardo Fagmer | none fired | approved | Catalog seed: "Run backup and seed", for the local database, the exact command, the two expected inserts and the dated backup.
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Activation: "Yes, activate" for `title-card-hf-template@5` and `scene-cards-hf-template@4`. Done in the app under the owner's session at `http://127.0.0.1:4310`; both promotion requests answered 201. Read back: v5 and v4 `active`, `title-card-hf-template@4` and `scene-cards-hf-template@3` `deprecated`.
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Preset: "Yes, re-pin". Saved in the app as `carrinho-completo-9x16@10` (draft) with only the template changed to `title-card-hf-template@5`; read back from the database. v9 is an unintended identical copy of v8 from the first attempt.
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Load new code: "Run api and watcher from the workspace" (build with tsc, stop installed api and launchd watcher, start both from the workspace).
- 2026-11-25 | Ricardo Fagmer | none fired | approved | Proof run: "Yes, proof run", then "Approve plan" at the plan gate with the US$ 0.70 estimate shown.

## Changes registered
Uncommitted in the working tree, together with earlier unrelated work. Files as listed under Scope.

## Notes
- The app signs in only at `http://127.0.0.1:4310`. At `http://localhost:4310` the web proxy refuses the origin and the page shows "Could not reach the local service"; the services were up. `studio doctor` run inside the agent sandbox reports web, api and database as failed for the same kind of reason (blocked loopback), not a real fault.
- The 20x render-time figure given to the owner is an estimate from frame count (600 s against 30 s), not a measurement.
- Elements with a `data-duration` different from the composition's keep their length; a clip that starts after the narration ends is simply never shown.
