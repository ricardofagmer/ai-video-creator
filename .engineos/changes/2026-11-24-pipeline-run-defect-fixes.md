---
name: 2026-11-24-pipeline-run-defect-fixes
status: active
owner: Ricardo Fagmer
spec: n/a — Fast change (supervisor) chosen by the developer; no spec text requested
domain: general
risk: medium
new_feature: false
release: false
---

## What
Fixes for the defects found by the real pipeline run `01M87X8M6HQ4YTTT91ZM3YW3CF` (2026-11-24).

## Why
The run showed: a local source URL accepted by the form and refused later by research; narration longer than the template limit; an unreadable hook and a footer under the captions on the title card; no per-scene text; cart prompts bound to the wrong agent slot; a report that listed its own stage as not delivered.

## Scope
- `apps/web/src/features/common/https-url.ts`, `apps/web/src/features/runs/new-run-model.ts`, `apps/web/src/messages/runs/{pt-BR,en,es}.ts`
- `apps/web/src/features/cart/cart-bindings.ts`
- `apps/watcher/src/stages/package/report.markdown.ts`, `apps/watcher/src/stages/executors/{package,script,composition}.executor.ts`
- `apps/watcher/src/stages/composition/hyperframes-preparation.ts`
- `packages/core/src/agents/packets/generator.packets.ts`
- `packages/shared/src/hyperframes/constants.ts`
- `seeds/templates/hyperframes/title-card/style.css`, new `seeds/templates/hyperframes/scene-cards/`, `seeds/templates/hyperframes/scene-cards.input.schema.json`, `seeds/catalog.seed.json`

## What was made
- New run form rejects a source URL on a loopback or private host, with a message in three languages.
- The writer's target is capped at 85% of the template's maximum duration, so spoken narration fits the template.
- Title card: hook text uses a light colour instead of the brand accent; the disclosure line moved to the top, out of the captions band.
- HyperFrames vocabulary gained six scene slots (`scene1Text`..`scene6Text`, `scene1StartS`..`scene6StartS`); the composition stage fills them from the script and narration timings.
- New template `scene-cards-hf-template@1` shows one on-screen text per scene.
- Cart checkout binds a role-named prompt to its own agent slot.
- `report.md` marks the stage that writes it (package) as delivered.

### Follow-up, same day: source URL may be http and local
The owner reversed the first form of fix 1. The source URL host may now be this machine or the private network (`localhost`, `127.x`, `10.x`, `172.16-31.x`, `192.168.x`) over `http` or `https`; public hosts stay `https` only; link-local (`169.254.x`) and IPv6 literals stay refused. Changed: `packages/toolbox/src/providers/media/{capture-url,playwright-capture}.ts`, `apps/watcher/src/stages/executors/{research,capture}.executor.ts`, `apps/watcher/src/stages/executors/site-analysis.ts`, `apps/watcher/src/stages/shared/stage-texts.ts`, `packages/shared/src/agents/analyst.ts`, `apps/web/src/features/common/https-url.ts`, `apps/web/src/features/runs/new-run-model.ts`, the three `messages/runs` files. Form checked in Chrome: `http://127.0.0.1:4310/` and `http://192.168.0.10:3000/x` pass; `http://example.com/` and `http://169.254.169.254/` are refused. Watcher side not built and not run. `security_review: pending` (capture guard changed).

## Not done
- Defect 5 (the Claude Code engine offers no tools to the agents): ADR 0011 decision 8 forbids it without a local MCP server. Needs its own design.
- Defect 4 (mock voice): the ElevenLabs provider is not in live mode. Configuration, not code.
- The title-card changes (v2) were seeded but not exercised by a run.
- The installed app still carries the old watcher; the new vocabulary reaches it only with a new app build.

## Checklist
- [x] Fix 1 source URL check
- [x] Fix 2 narration target margin
- [x] Fix 3a hook colour, fix 6 disclosure position
- [x] Fix 3b per-scene text and scene-cards template
- [x] Fix 7 cart prompt slots
- [x] Fix 8 report package line
- [ ] ~~Fix 5 agent tools~~ not done: blocked by ADR 0011 decision 8

## User checklist
- [ ] Approve and run `pnpm typecheck` and `pnpm lint` (skipped at the final checkpoint).
- [ ] Build and install the app so the installed watcher understands the scene slots.
- [ ] Set the ElevenLabs provider to live mode for a real voice.
- [ ] Decide on a design for agent tools in the Claude Code engine (defect 5).
- [ ] Review run `01M87YAHVEGZ6721XFEDSJGZV9` and close the two waiting runs `01M87X252XB91GJANGDT6TZA9K`, `01M87X4XNHGY1M4591X51BSBC8`.

## Human decisions
- 2026-11-24, Ricardo Fagmer: scope = all four fix groups; planning lane = Fast change (supervisor). No HITL reason id fired.
- 2026-11-24, Ricardo Fagmer: capture guard scope for the source URL = "Machine and private network".
- 2026-11-24, Ricardo Fagmer: final checks = "Skip for now"; run proof = "Rebuild, seed and run" (covers the catalog seed against the local data home and the temporary watcher swap).

## Verification
- [validation] pending — final-stage user approval required (`pnpm typecheck`, `pnpm lint` skipped by the developer).
- ran: `pnpm turbo run build --filter=@studio/watcher... --filter=@studio/cli...` exit 0 (2026-11-24), 7 of 7 tasks.
- ran: `node tools/cli/dist/main.js catalog seed --source-root <repo parent>` exit 7 (2026-11-24): 2 created (`title-card-hf-template@2`, `scene-cards-hf-template@1`), 29 unchanged, 4 failed (music source files missing from the repo, same as before this change).
- Run `01M87YAHVEGZ6721XFEDSJGZV9` (preset `cartoes-de-cena-prova-das-correcoes@2`, target 30 s, source watcher): reached review; `final.mp4` 23.8 s, 1080x1920; five scene texts shown at their scene starts; disclosure at the top; `report.md` line `14 package: delivered`. Frames: `docs/scene-cards-proof.png`.
- Fix 7: preset v1 bindings read from the API: `prompt:writer = writer-prompt@1`, `prompt:director = director-prompt@1`.
- Fix 1: checked in Chrome on port 4310: `http://127.0.0.1:4310/` and `https://192.168.0.10/x` rejected with the new message.

## Changes registered
Not a git repository; no `git status` or diff available. Files are listed under Scope.
