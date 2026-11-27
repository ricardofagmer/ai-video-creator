---
name: 2026-11-23-guided-creation
status: active
owner: Claude (supervisor) for the owner
spec: docs/specs/2026-11-23-guided-creation-design.md
domain: llm
security_review: pending
risk: high
new_feature: true
release: false
---

## What
Four additions to Video Studio: a playable sample for every voice, rules that block conflicting
creation choices, an AI style analysis of every saved video reference (used by the writer and
director), and a "Criar vídeo" wizard from the idea to the finished video.

## Why
The owner asked: "the voices should be playable to the user listen to decide which one use also
create some rules, to not allow thing that will conflict the video creation like many voices and
etc also when save video reference start ai to analise the content to create a prompt references
to apply in the creations also create a wizard pipeline to start from step 0 till the outcome".

## Scope
See the spec's frozen contracts and tickets: packages/shared, packages/core, apps/api,
apps/watcher, apps/web.

## Checklist
- [x] Spec with acceptance criteria AC1–AC13, frozen contracts and tickets T1–T7
- [x] Owner approves the spec ("Approve (Recommended)", "No preview, build (Recommended)")
- [x] T1 shared contracts (written, not compiled; Amendment 1 in the spec)
- [x] T2 core
  - [x] agents half: `ReferenceAnalystService`, prompt `reference-analyst@1`, `writer@7`, `director@5`, packet field (returned DEGRADED: nothing compiled; spec Amendment 2)
  - [x] backend half: asset-job commands, migration (authored only), rule checks; seeds already pass (returned DEGRADED: nothing compiled)
  - [x] backend follow-up (spec Amendment 3): costs through `cost.json` then an api index command, scheduled runs check the rules, two small fixes (returned DEGRADED: nothing compiled)
  - [x] supervisor edit: each cost session keeps its own price table version, so a table upgrade never stops recording (`packages/shared/src/asset-jobs/cost.ts`, core `costs/asset-job-cost-file.ts`, `asset-job-cost.mapper.ts`, `cost-indexer.service.ts`, `asset-jobs/asset-job-cost.service.ts`)
- [x] T3 api: five routes (session guard on all, Origin allowlist on the POSTs), views, audio stream with no-store/nosniff and Range, error map, enqueue on every save path, cost index (returned DEGRADED: nothing compiled; `api-test-home.ts` token table breaks `session.test.ts` and `by-reference.test.ts` until T7)
- [x] T4 watcher: asset-job step on idle ticks (one job at a time, after curations), voice-sample and reference-analysis handlers, local frame sampler, kept analyses passed to the script and scenes stages (returned DEGRADED: nothing compiled or tested; 18m57s)
- [x] T5 web: voice button, analysis card, conflict messages (returned DEGRADED: written, not compiled, not seen running)
- [x] T6 web: wizard at `/criar`, steps 0 to 6, menu entry, three languages (returned DEGRADED: written, not compiled, not seen running)
- [ ] T7 final proof: tests, typecheck, lint, security review, critic pass (final-gate consent)

## What was made
Everything below is written and none of it was compiled, linted, tested or seen running.
- The design spec `docs/specs/2026-11-23-guided-creation-design.md`, with Amendments 1 to 3.
- Playable voice samples: a job queue under `asset-jobs/` in the data home, a watcher step that
  speaks one fixed sentence per voice, an api route that streams the clip, and an `Ouvir` button
  in the catalog, the cart, the recipe editor and the wizard.
- Conflict rules, one shared module run by the web screens, the core recipe and run commands and
  the schedule gate: one voice, template, brand kit and music; an enabled stage needs its binding;
  template and format must match; duration must fit the template.
- Video-reference analysis: saving a video-file reference queues one analysis (8 frames, one model
  call, no tools); the style notes show on the reference and reach the writer (`writer@7`) and the
  director (`director@5`) as untrusted data.
- The `Criar vídeo` wizard at `/criar` (steps 0 to 6, three languages, first item in the menu).
- One authored migration that lets `cost_entries` hold `asset-job` rows. Not applied.

## Not done
- T7 final proof. The owner answered on 2026-11-24: final checks "Skip for now", tests and browser
  verification "Not now", security review "Decline security review". So no typecheck, lint, test,
  browser check or security review ran.
- The `critic` pass that risk high requires: not run, because the work is not being called done.
- The migration is not applied; the api and watcher were not rebuilt or restarted.
- About 15 existing test files are expected to fail until they are updated (listed in Notes).

## User checklist
- [x] Approve the spec (or ask for changes)
- [ ] Reopen the final checks (typecheck, lint) when you want the feature verified
- [ ] Reopen the tests and the browser check after that
- [ ] Confirm the exact command before the `asset-job` migration is applied to your database
      (`corepack pnpm --filter @studio/core run prisma:migrate:deploy`)
- [ ] Rebuild and restart the api and the watcher so the new routes and the job step exist
- [ ] Decide later whether you want the security review and the critic pass after all

## Verification
[validation] pending — final-stage user approval required (lint, typecheck, tests)
Nothing was executed. Security review: declined by the owner on 2026-11-24, so `security_review`
stays `pending` and the feature is not security-verified.

## Human decisions
- 2026-11-23 | owner | none fired | approved | voice sample: "Generate once, all voices (Recommended)", clone included, generated sample only
- 2026-11-23 | owner | none fired | approved | rules to block: one of each kind; step on without what it needs; template and format mismatch; duration outside the template range
- 2026-11-23 | owner | none fired | approved | video analysis: "Style notes on the reference (Recommended)"; link-only videos: "Analyse video files only (Recommended)"
- 2026-11-23 | owner | none fired | approved | wizard: "New guided flow beside them (Recommended)"
- 2026-11-23 | owner | high-risk | approved | spec approval: "Approve (Recommended)" (strict variant: narration on with no voice is refused in mock mode too); build T1 to T6, checks and reviews wait for the final gate
- 2026-11-23 | owner | none fired | declined | prototype preview: "No preview, build (Recommended)"
- 2026-11-24 | owner | none fired | deferred | final checks (typecheck and lint in shared, core, api, watcher, web; ten commands): "Skip for now". Nothing ran; validation stays pending until the owner reopens it
- 2026-11-24 | owner | none fired | deferred | tests and browser verification (the one test-readiness question): "Not now (Recommended)". No test was written or run, no `test-ready` record was made, no screen was checked
- 2026-11-24 | owner | high-risk | refused | security review (read-only reviewer, no scans available): "Decline security review". No review ran; `security_review` stays `pending`

## Changes registered
Not a git repository, so there is no `git status` or diff to paste. Files, by area:
- docs: `docs/specs/2026-11-23-guided-creation-design.md` (new), this record (new).
- packages/shared: `src/asset-jobs/` (new, 7 files), `src/agents/reference-analysis.ts`,
  `src/recipes/composition-rules.ts`, `src/api/asset-jobs.ts`, `src/ports/asset-jobs.ts` (new);
  edited `agents/{index,writer,director}.ts`, `recipes/index.ts`, `api/{index,common,routes}.ts`,
  `ports/index.ts`, `package.json`.
- packages/core: `src/asset-jobs/` (new, 24 files), `src/agents/reference-analyst/` (new, 8 files),
  `src/agents/prompts/reference-analyst.prompt.ts`, `src/recipes/recipe-composition.check.ts`,
  `src/schedules/schedule-composition.ts`, `src/costs/{asset-job-cost.mapper,asset-job-cost-file}.ts`,
  `src/costs/commands/index-asset-job-cost.{command,handler}.ts`,
  `prisma/migrations/20261123180000_asset_job_cost_source/migration.sql` (new); edited agents
  (factory, module, index, packets, writer and director prompts), catalog (status handler, module),
  recipes (errors, two handlers, module, index), runs (`run-draft.service.ts`), schedules (gate,
  reader, errors, slot decision, facts collector, index), costs (errors, indexer, month-to-date,
  module, index), `paths/data-home.ts`, `package.json`, `prisma/schema.prisma` (comment only).
- apps/api: `src/catalog/{asset-jobs.controller,asset-job-view.assembler,asset-job-cost-index.service,voice-sample-audio.streamer}.ts`
  (new); edited `catalog/{catalog.controller,catalog-api.module}.ts`, `app.module.ts`,
  `platform/{error-mapping,api-exception.filter}.ts`.
- apps/watcher: `src/asset-jobs/` (new, 14 files), `src/stages/shared/reference-analyses-input.ts`
  (new); edited `watcher-ports.module.ts`, `stages/shared/{stage-dependencies,stage-texts}.ts`,
  `stages/stage-executors.providers.ts`, `stages/executors/{script,scenes}.executor.ts`,
  `daemon/{daemon-loop,watcher-daemon.module}.ts`.
- apps/web: `src/features/voices/` (new, 6 files), `src/features/wizard/` (new, 19 files),
  `src/messages/wizard/` (new, 3 files), `src/app/(studio)/criar/` (new, 3 files), new files in
  `features/common`, `features/catalog`, `features/cart/components`, `features/recipes`,
  `features/runs`; edited `lib/api/*`, `messages/{common,catalog}/*`, `messages/{pt-BR,en,es}.ts`,
  catalog, cart, recipes and runs components, `features/shell/navigation-groups.ts`,
  `app/(studio)/execucoes/nova/page.tsx`.

## Notes
- `cost_entries.source_kind` has a CHECK of `run | curation`; the spec adds `asset-job` through one authored migration.
- The writer prompt is `writer@7`: `writer@6` was taken the same day by the word-budget change (`2026-11-23-claude-code-engine`). Spec Amendment 2.
- Open risks from the analyst worker, for the final security review: frames are images and are not redacted (defences: no tools, strict bounded schema, output scan, delimiter); "never identify people" is enforced by the prompt only; Mastra's acceptance of the user-message image part is unverified; under the Claude Code engine a live analysis ends `credential-refused`.
- Spec Amendment 3 (2026-11-24): the watcher's database connection is read-only (ADR 0003), so asset-job costs go through `cost.json` and an api index command, like curations; scheduled runs check the rules; a done analysis is not re-billed; the cart counts only voices for the `ai-model` slot (supervisor edit in `packages/shared/src/recipes/composition-rules.ts` and the three `messages/common` files).
- Accepted gaps after the backend follow-up: a scheduled occurrence stopped by a rule is logged as `recipe-not-runnable` (the shared skip enum has no `composition-conflict` value); a worst-case cost estimate is recorded as a billed amount (no `estimated` flag on the port), which errs high; month-to-date now lists up to 5000 job folders per computation.
- From the web worker, to check on screen: the `Ouvir` button beside the voice select may wrap or squeeze it; cart dialog rows now wrap; cart items saved before this change show no `Ouvir` until re-added; a new recipe cannot be saved until a voice is chosen or narration is turned off (the approved strict rule).
- Existing tests expected to break (T7 fixes them): core `catalog.test.ts`, `recipes.test.ts`, `runs.test.ts`, `seed.test.ts` constructors and fixtures without a voice binding; likely the comparisons, curation, schedules and api tests that build recipes from `test-support/fixtures.ts`.
- Watcher (T4): stale claims end `failed`/`claimant-gone`; shutdown ends `claimant-gone` and unexpected errors `provider-error` (the job error enum has no `watcher-stopped` or `internal-error`); a failed `cost.json` write is logged as an error and the billed call is never retried; biometric versions go to the local voice or the mock only; the frame sampler is a watcher-local copy because core's `ffmpeg-frames` is not exported. Unverified: the watcher's module graph (three modules imported in two places) and Mastra's image part.
- Watcher and api tests expected to break (T7): `daemon-loop.test.ts`, `daemon-loop.platform-steps.test.ts`, `stage-executors.test.ts`, `composition-stage.harness.test.ts`, `schedule-step.harness.test.ts`, `slot-facts.month-spend.test.ts`; api `api-test-home.ts` token table (`session.test.ts`, `by-reference.test.ts`).
- The audio route supports Range (api `voice-sample-audio.streamer.ts`).
- The rule "step on without what it needs" also stops mock-mode runs of recipes with narration and no voice; the seed recipes get a voice binding in T2.
