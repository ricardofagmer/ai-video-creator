---
name: 2026-11-24-optional-inputs-and-must-use
status: active
owner: Ricardo Fagmer
spec: none — the developer chose "Build directly" over a spec for a change above the spec threshold
domain: llm
risk: medium
new_feature: true
release: false
security_review: pending
---

## What
Topic is the only required brief field: no preset forces a Source URL or key messages. What the owner does choose (prompt, skills, site, references, instructions) must be used by the writer and the director, and the reviewer checks it.

## Why
The studio composes many kinds of video. A website is one optional source among others (references, a skill, voice and text). A chosen item that the agents could ignore was a silent loss.

## Scope
- `packages/shared/src/recipes/recipe.ts`
- `apps/web/src/features/recipes/recipe-form-model.ts`
- `apps/web/src/features/recipes/components/{RecipeFlowSections,RecipeEditor}.tsx`
- `apps/web/src/features/runs/components/RunBriefFields.tsx`
- `packages/core/src/agents/prompts/{writer,director,reviewer}.prompt.ts`
- `packages/shared/src/agents/{protocol,writer,director}.ts`
- `packages/core/src/agents/tools/run-artifact.sources.ts`
- `packages/core/src/agents/packets/generator.packets.ts`, `packages/core/src/agents/index.ts`
- `apps/watcher/src/stages/agents/packet-sources.ts`
- `apps/watcher/src/stages/shared/owner-references-input.ts` (new)
- `apps/watcher/src/stages/executors/{script,scenes}.executor.ts`
- `apps/watcher/src/daemon/{daemon-loop,daemon.settings}.ts`
- `apps/watcher/src/stages/executors/{verify.executor,claim-evidence}.ts`, `apps/watcher/src/stages/shared/stage-texts.ts`

## What was made
- `missingBriefInputs` no longer reports a missing Source URL or missing key messages, for every preset, old and new; it reports only more key messages than the preset's maximum. The preset form shows both inputs unchecked and disabled; the run form marks both "(optional)".
- `writer@8`, `director@6`: a rule that every chosen item must be visibly reflected. The bound prompt and skills are the source of truth for how the script is built; the site and reference analyses are what the result must resemble, never copied.
- `evaluator@2`: the reviewer may read `site-analysis` and `reference-analyses` for script and scenes, and reports work that ignores one as a blocking issue. A not-produced artifact means none was chosen.
- New packet field `ownerReferences` for writer and director: every reference of the run with name, sub-kind, the owner's notes and, for a text reference, its content (at most 8 references, 6000 characters each).
- The watcher ends up to 4 open asset jobs before it starts a run, so a reference saved just before the run has its analysis when `script` reads it.

- Fact check (`verify`): with no Source URL, each key message passes as a statement made by the owner (`evidenceRef` `owner:key-message-N`, excerpt = the statement); the step reports that no source was checked. With a Source URL the page-text check is unchanged.

## Not done
- The "must use" rule and the reviewer's use check were not judged by a real model: in the proof run the writer, director and evaluator sessions cost US$ 0.00 and ended within a millisecond, so the answers did not come from a live model.
- Image pixels are not sent to the agents: an image reference reaches them through its name and the owner's notes only.
- The writer rule `claimsOnly` is unchanged: with no Source URL there are no verified claims, so factual sentences stay limited.
- The reviewer does not read `ownerReferences`; it checks the site and the video analyses only.
- Tests not updated or run. Tests that assert missing brief inputs, prompt versions or the daemon loop order may fail.

## Checklist
- [x] Stop forcing Source URL and key messages
- [x] "Must use" wording, skill as source of truth
- [x] Reviewer checks use
- [x] Open analyses end before a run
- [x] Image and text references reach writer and director (image: name and notes only)
- [x] End-to-end run without Source URL on the rebuilt API and watcher

## User checklist
- [x] Approve the build of shared, core, API and watcher, and the install or swap.
- [ ] Approve `pnpm typecheck`, `pnpm lint` and the tests.
- [ ] Approve the security review: more owner and third-party text reaches the agents.

## Human decisions
- 2026-11-24, Ricardo Fagmer: Fact check with no Source URL = "Owner's word counts"; install = "Full package, reinstall".
- 2026-11-24, Ricardo Fagmer: approved typecheck and build ("approved and build it"); swap method = "Full package, reinstall".
- 2026-11-24, Ricardo Fagmer: forced fields = "Never force"; must-use gaps = "Analyse references first", "Image and text references", "\"Must\" wording", "Reviewer checks use", plus "uses the skill or ai writing as source of truth to follow the creation"; planning = "Build directly". No HITL reason id fired.

## Verification
- [validation] pending — final-stage user approval required.
- Checked in Chrome on port 4310 (dev server): the new run form with preset "Carrinho completo 9x16 · v3" labels Source URL and Key messages "(optional)"; that preset's page shows Brief inputs with Topic checked and Source URL and Key messages unchecked and disabled. No console errors.
- Prompt, reviewer, reference and watcher changes were not run.
- ran: `pnpm run typecheck` in `apps/web` exit 0 (2026-11-24).
- ran: `pnpm run typecheck` in `packages/shared` exit 0; in `packages/core`, `apps/api`, `apps/watcher` exit 2, every error in old `*.test.ts` files, none in source (2026-11-24).
- ran: `pnpm exec turbo run build` exit 0, 12 of 12 tasks, after two web lint fixes (unused import in `RecipeFlowSections.tsx`, return type in `messages/wizard/pt-BR.ts`) (2026-11-24).
- ran: `pnpm --filter @studio/shell run package:dmg` exit 1 at the `hdiutil` image step only; the signed app verified ("payload manifest verified: 49676 files match") (2026-11-24).
- Installed: the new app replaced `/Applications/EngineOS Video Creator.app` (payload `builtAt` 2026-11-25T00:38:25.274Z); the old app is in `apps/shell/out/previous-install-20261124213929`. API answers 200 on 4311, the watcher started (pid 50985). The installed files carry `writer@8`, `evaluator@2`, `assetJobsBeforeRun` and `briefCorrected`.
- Proven in part on run `01M880HAN9K1B55ZWS4BYWQV3W`: the API and the watcher accepted a brief with no Source URL. The run then stopped at Fact check: the key message "video maker" has no evidence because there is no page text.
- ran: `pnpm exec turbo run build` exit 0, 12 of 12 tasks; package verified "49716 files match"; installed (payload `builtAt` 2026-11-25T00:48:20.433Z), old app in `apps/shell/out/previous-install-20261124214915`; API 200 on 4311 (2026-11-24).
- Installed a third time (payload `builtAt` 2026-11-25T00:57:39.944Z), old app in `apps/shell/out/previous-install-20261124215839`.
- Proven end to end on run `01M880HAN9K1B55ZWS4BYWQV3W` (2026-11-24): "Fix" then "Save and resume" with no Source URL reran stage 3. `verify:execute:2` reported "Sem URL de origem: 1 mensagem(ns)-chave aceita(s) como afirmação do dono, sem conferência com uma fonte."; `claims.json` holds `claim-1` verified with `evidenceRef` `owner:key-message-1`; check `claims-evidence` passed. The run then delivered stages 4 to 14 and moved `running -> review`.

## Changes registered
Not a git repository; files are listed under Scope.
