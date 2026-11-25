---
name: 2026-11-24-video-uses-site-and-images
status: active
owner: Ricardo Fagmer
spec: none — the developer chose "Build directly" over a spec for a change above the spec threshold
domain: backend
risk: medium
new_feature: true
release: false
security_review: pending
---

## What
A run now uses what the owner gave it: the video shows the source site and the chosen images behind the text, the site's facts reach the writer, images picked in the cart reach the run, the Reviewer reads the work and a low score stops the run once, and the installed watcher can be pointed at the local voice program.

## Why
Run `01M885GX44RWD23SWYQRFQ6TG7` produced a text-only card with a mock voice. Causes found:
- The HyperFrames templates had no picture layer; template variables are flat text and numbers, so no media could be passed.
- The preset has `research` and `verify` switched off, so a Source URL was never read.
- Cart references reached a run only with `?carrinho=1` or a new wizard draft; image assets were dropped from owner references and never offered to the director.
- The Claude Code engine gives the model no tools, so the Reviewer scored work it never read (2.5, "no read tools were available"), and a score under the preset threshold was recorded as `skipped`.
- The preset binds `elevenlabs-voice@1`, whose provider is in mock mode; the installed watcher starts from launchd and had no way to receive `LOCAL_VOICE_PYTHON` / `LOCAL_VOICE_SCRIPT`.

## Scope
- `apps/watcher/src/stages/composition/hyperframes-background.ts` (new), `render-plan.mapper.ts`
- `apps/watcher/src/stages/process/tool-runner.protocol.ts`, `runner/path-confinement.ts`, `runner/hyperframes.handlers.ts`
- `apps/watcher/src/stages/executors/{composition,scenes,script,agent-review}.executor.ts`
- `apps/watcher/src/stages/agents/review-evidence.ts`
- `apps/watcher/src/stages/shared/{stage-texts,owner-references-input}.ts`, `stages/stage-executors.providers.ts`
- `apps/watcher/src/engine/run-engine.ts`
- `packages/shared/src/hyperframes/constants.ts`, `packages/shared/src/recipes/recipe.ts`
- `packages/core/src/runs/run-draft.service.ts`
- `packages/core/src/agents/{agents.service.ts,packets/agent-packet-facts.ts,tooling/agent-tool-set.ts,tools/read-only-tool-set.provider.ts,tools/text-page.ts,prompts/director.prompt.ts,prompts/reviewer.prompt.ts}`
- `packages/core/src/providers/{provider-settings-file.ts,index.ts}`
- `apps/web/src/features/wizard/hooks/useWizardDraft.ts`, `features/runs/components/NewRunForm.tsx`, `features/recipes/recipe-form-model.ts`
- `seeds/templates/hyperframes/{title-card,scene-cards}/`, `title-card.input.schema.json`, `seeds/catalog.seed.json`

## What was made
- Picture: the composition stage plans one background stretch per directed scene (site capture, bound image or video, else the first capture, else a dark stretch). The tool runner cuts them into `media/background.mp4` inside the staged template copy with ffmpeg; both studio templates play it behind a scrim. `title-card` also shows a text line per scene.
- Site facts: a run created with a Source URL switches `research` and `verify` on and asks for the site analysis, whatever the preset says.
- Cart images: cart references are read on every arrival at the new-run form and merged into restored wizard drafts; image assets count as owner references; image and video references are offered to the director, whose prompt (`director@7`) must show them and prefer captures over title cards.
- Reviewer: on the Claude Code engine the service reads the packet's run artifacts through the guarded read tool (allowlist, call counter, redaction, trace) and puts them in the prompt (`evaluator@3`). A score under the preset's `reviewer-score` threshold stops the stage for the owner the first time it runs, at `script`, `scenes` and `agent-review`.
- Fix and resume: a corrected brief reruns from `script` when the run stopped at or after it, so a stop at the render review rebuilds the video.
- Voice: `providers.json` accepts `localVoicePython` and `localVoiceScript`; the watcher's stage settings read them.

- 2026-11-24 follow-up: template versions activated through the app (scene-cards-hf-template@2, title-card-hf-template@3), preset carrinho-completo-9x16 rebound to title-card-hf-template@3 (v5), app reinstalled twice (last builtAt 2026-11-25T02:24:00.852Z).
- 2026-11-24 follow-up: Fact check (`apps/watcher/src/stages/executors/verify.executor.ts`) no longer stops a run when a key message has no evidence on the source page. The message is dropped from `claims.json` and named in the step result (`stageTexts.keyMessagesDropped`). Two tests in `apps/watcher/src/stages/__tests__/stage-executors.test.ts` changed to match.
- 2026-11-24 follow-up: the Reviewer now gets the stage's draft inside the review packet (`packages/core/src/agents/review-recovery.packets.ts`, schema `draft` field, watcher `reviewer.ts`, both executors pass it), so it no longer scores a written script as not produced. Proven live: scores 2.4, 2.5, 3 then 2.5, 3.4, 3.6 on the real script.
- 2026-11-24 follow-up: a review never stops a run. `revisionsExhaustedFailure` and `lowScoreFailure` were removed from `apps/watcher/src/stages/agents/review-evidence.ts`; `reviewCaveat` returns a note instead, and `script`, `scenes` and `agent-review` executors continue with the last draft and that note (`stageTexts.reviewerContinued`). Prompts: `evaluator@5` does not fault a missing, vague or unsupported key message; `writer@9` builds the main message from site analysis, verified claims, references and owner instructions when the key messages give nothing. Proven live: Scenes on run 01M888DYPF9XH8HRBJWDE1Y54Y passed `verify ok com aviso` instead of waiting.
- 2026-11-25 follow-up, through the app only: duration limit 10 minutes. `title-card-hf-template@4` and `scene-cards-hf-template@3` saved with duration 3-600 s and activated (v3 and v2 now deprecated); preset `carrinho-completo-9x16@8` has format 3-600 s and pins `title-card-hf-template@4`. v6 and v7 are intermediate saves (v7 equals v6 because the template select change was not taken). The new-run form offers 3-600 s on v8. No code change.

## Not done
- No run was made with these changes: the new template versions are not in the catalog and the preset still binds `title-card-hf-template@1`. Both are database writes that wait for the owner.
- The owner's voice is not speaking yet: `owner-voice-clone-pt@1` is a draft, the preset binds `elevenlabs-voice@1`, and `providers.json` has no local voice paths. All three are owner decisions.
- A Source URL added later through the Fix window does not un-skip stages the run already skipped.
- The low-score stop uses the step's attempt number: a stage whose first attempt failed for another reason is not stopped by a low score on the retry.
- The render review reads metrics and artifacts only; frames are not sampled on the Claude Code engine.
- The repeated music track and the mis-bound prompt slots of the preset were reported and not changed.
- No tests written. Old `*.test.ts` files that implement `AgentToolSetProvider` may need the new `readArtifacts` method.

- Proof run 01M888DYPF9XH8HRBJWDE1Y54Y stopped at Script: the evaluator scored 1 because it read the script artifact as `ERROR_NOT_PRODUCED_YET` while `script.json` was written. Separate defect, not diagnosed yet.
- Site analysis key points are written in pt-BR while the page is in English, so 0 of 8 key points found evidence in that run.
- Typecheck and tests for the Fact check change: skipped by the owner, not run.
- `apps/watcher/src/engine/__tests__/review-loop.eval.test.ts` (lines 12 and 219) still imports and calls the removed `revisionsExhaustedFailure`: that test no longer compiles. No tests yet for `reviewCaveat` or the draft in `buildReviewPacket`.
- The header shows "Watcher stopped" while a HyperFrames render runs, though the watcher is alive and rendering (heartbeat delayed). Reported, not changed.
- HyperFrames render of a 27.5 s video takes more than 10 minutes on this machine.
- `seeds/catalog.seed.json` still says maxSec 30 for both templates; the live catalog has 600.
- 2026-11-25 proof run result: composition render took about 11.8 min; render review scored 3 and the run continued. Frames show the site behind the text, but the scrim is light and the busy page competes with the title; burned captions sit on top of the scene text lines in the lower third. Narration is still the mock voice.

## Checklist
- [x] Background clip planned, cut and played by both templates
- [x] Research and verify on with a Source URL
- [x] Cart images reach the run and the director
- [x] Reviewer reads artifacts; low score stops once
- [x] Local voice paths readable by the installed watcher
- [x] Reviewer reads the draft from the packet
- [x] Reviews never stop the run (Script and Scenes continued with a caveat)
- [x] Duration limit 600 s in templates, preset v8 and the new-run form
- [x] Proof run in the app reaches final.mp4 (run 01M888DYPF9XH8HRBJWDE1Y54Y: all 14 stages delivered, status review, final.mp4 1080x1920 h264+aac 27.5 s, site captures visible behind the text)

## User checklist
- [ ] Approve the catalog seed (new template versions) and the preset rebind.
- [ ] Decide the voice: activate and bind the cloned voice, or enter an ElevenLabs key in the terminal.
- [ ] Approve the rebuild and reinstall, then a proof run.
- [ ] Approve `pnpm lint`, the tests and the security review.

## Human decisions
- 2026-11-24, Ricardo Fagmer: fix scope = picture, site facts, cart images, reviewer reads and blocks; render path = "Add media to HyperFrames"; voice = "Wire real voice now"; planning = "Build directly". No HITL reason id fired.

- 2026-11-24, owner: approved activate, rebind, reinstall and proof run; chose "Drop it and continue" for key messages without evidence; skipped typecheck and tests; approved reinstall and a new proof run.
- 2026-11-24, owner: "Send draft in packet"; "Reinstall + resume"; "when not find the main message go for the rest and analise all but not stop never"; duration "the limit is 10 minutos" via "Catalog: new versions".
- 2026-11-25, owner: "Not now" for typecheck, tests and security review after the proof run; they stay pending.
- 2026-11-25, owner: "Activate both" for title-card-hf-template@4 and scene-cards-hf-template@3 (approval recorded in the app under the owner's name).

## Verification
- [validation] pending — final-stage user approval required.
- ran: `pnpm exec tsc --noEmit -p .` in `packages/shared` and `apps/web` exit 0; in `packages/core` and `apps/watcher` exit 2, every error in old test files, none in source (2026-11-24).
- Proven outside the app: a scratch template with `<video src="media/background.mp4">` rendered with HyperFrames 0.9.72 under `--strict`, with a capture, an image and a capture as the three stretches.

## Changes registered
Not a git repository; files are listed under Scope.
