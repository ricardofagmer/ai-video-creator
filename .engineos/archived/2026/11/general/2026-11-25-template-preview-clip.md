---
name: 2026-11-25-template-preview-clip
status: done
completed: 2026-11-25
owner: supervisor
spec: n/a — Fast change (supervisor) chosen by the developer
domain: general
# security_review: not-required
risk: low
new_feature: true
release: false
---

## What
Each template version in the catalog now gets a short muted preview clip (6 s, 9:16 MP4) and a
poster frame. The clip is rendered from the template's own sample copy. The catalog card keeps its
glyph cover; while the pointer or focus is on a template card, a small popover beside the card plays
the clip with the template name and a short description of what that kind of template makes. While
the clip renders, the popover shows a "Gerando prévia…" badge.

## Why
The developer asked for the catalog page to show what each template can do, with the sample made
when the template is registered.

## Scope
- shared: `asset-jobs/asset-job.ts`, `asset-jobs/constants.ts`, `api/asset-jobs.ts`, `api/routes.ts`
  (new `template-preview` job kind, bounds, view and routes).
- core: asset-job policy, store, enqueuer, the get-template-preview queries and handlers, module and index exports.
- api: `catalog/catalog.controller.ts` (enqueue on save), `catalog/asset-jobs.controller.ts` (view, clip and
  poster routes), `catalog/asset-job-view.assembler.ts`, `catalog/voice-sample-audio.streamer.ts`,
  new `catalog/template-preview.backfill.ts`, `catalog/catalog-api.module.ts`.
- video: new `src/render/preview-input.ts` (Remotion-free sample input).
- watcher: new `asset-jobs/template-preview.handler.ts`; `asset-job-file.mapper.ts`, `asset-job-signals.ts`,
  `claimed-asset-job.ts`, `asset-job-step.ts`, `watcher-asset-jobs.module.ts`.
- web: `lib/api/route-table.ts` (proxy allowlist for the three preview routes), `lib/api/client.ts`, `lib/api/browser.ts`, `lib/api/index.ts`, new `features/catalog/hooks/useTemplatePreview.ts`,
  new `features/catalog/components/TemplatePreviewHover.tsx` + `.module.css`, `features/catalog/components/CatalogAssetItem.tsx`,
  `messages/catalog/{pt-BR,en,es}.ts`.

## Checklist
- [x] Job kind, bounds and api contract in shared
- [x] Enqueue on register (not awaited) and query handlers in core/api
- [x] Backfill of existing templates
- [x] Watcher handler renders clip and poster through the tool runner, $0, local
- [x] Hover popover beside the card: clip, name, short description, rendering badge (card cover unchanged)
- [x] Visual check of the card in the browser

## What was made
Registering or saving a template version enqueues a `template-preview` asset job. The watcher
renders the template's sample input over a silent track through the tool runner `render` command,
checks both files against the size bounds, and writes `preview.mp4` and `preview.png` into the job
folder. The api serves the view, the clip (with Range) and the poster. Templates without a 9:16
Remotion composition (HyperFrames, hook, ProductTour16x9) answer `unavailable: not-supported`.

Deviation from the plan: the backfill was proposed as a CLI command `studio catalog previews`. It
landed as an api background service instead (`TemplatePreviewBackfill`): one pass at api start,
then one every 2 minutes, stopping at a full queue. Enqueue is idempotent, so a pass only adds jobs
for versions without a preview.

## Not done
Nothing in scope. The short description comes from the template's category (tags), because
templates have no description field; a user-created category gets the generic text.

## User checklist
- [x] Signed in at 127.0.0.1:4310; hovering a Vertical (9:16) template card opens the popover with the clip and description (checked in Chrome, 2026-11-25).
- [ ] The installed app (/Applications) still runs the old code; reinstall when this ships.

## Verification
- ran: `pnpm turbo run build --filter=@studio/api --filter=@studio/watcher` exit 0 (2026-11-25) (first run failed on a scene asset type in the watcher handler; fixed by mapping scenes to `RenderSceneRequest`)
- ran: `pnpm --filter @studio/web typecheck` exit 0 (2026-11-25)
- Runtime: after restarting the api and the source watcher, the backfill queued 6 jobs (tool-demo, ai-battle and automation-blueprint, versions 1 and 2). All 6 ended `done`, with clips of about 0.75 MB and posters of about 1.07 MB. `ffprobe`: 1080x1920, 6.5 s.
- Visual check in Chrome at 127.0.0.1:4310/catalogo?secao=modelos: the first load showed glyph covers because the web proxy refused the new routes (`route-not-allowed`). After adding them to `route-table.ts`, the view, clip (video/mp4) and poster (image/png) answer 200, the three Vertical cards show the poster, hover plays the clip and leaving resets it to 0. The proxy answers Range requests with the full file (200), like the voice-sample audio.
- ran: `pnpm --filter @studio/web typecheck` exit 0 after the route-table change (2026-11-25)
- Second pass, at the developer's request: the clip on the card cover was rolled back (the cover showed the poster small inside the 90 px strip). Checked in Chrome: the glyph cover is back; hovering Tool Demo 9:16 opens a 220 px popover beside the card with the clip playing (currentTime advancing, no media error), the name and the description; leaving the card removes it.
- ran: `pnpm --filter @studio/web typecheck` exit 0 after the popover (2026-11-25)
- No tests were run (none were requested).

## Human decisions
2026-11-25 | developer | n/a | approved | Short clip loop, background job, backfill existing, Fast change, stay on branch feat/catalog-image-library, build + verify.

## Changes registered
Uncommitted on `feat/catalog-image-library`. The working tree also holds unrelated changes from other work; only the files in Scope belong to this change.
The scoped paths below also carry edits from earlier catalog work on this branch (voice-sample audio, other catalog messages), so the counts are larger than this change alone.

- 27 tracked files modified and 15 new files across shared, core, api, video, watcher and web; nothing committed, no renames.

`git status --short` (scoped):
```
 M apps/api/src/catalog/asset-job-view.assembler.ts
 M apps/api/src/catalog/asset-jobs.controller.ts
 M apps/api/src/catalog/catalog-api.module.ts
 M apps/api/src/catalog/catalog.controller.ts
 M apps/api/src/catalog/voice-sample-audio.streamer.ts
 M apps/watcher/src/asset-jobs/asset-job-file.mapper.ts
 M apps/watcher/src/asset-jobs/asset-job-signals.ts
 M apps/watcher/src/asset-jobs/asset-job-step.ts
 M apps/watcher/src/asset-jobs/claimed-asset-job.ts
 M apps/watcher/src/asset-jobs/voice-sample.plan.ts
 M apps/watcher/src/asset-jobs/watcher-asset-jobs.module.ts
 M apps/web/src/features/catalog/components/CatalogAssetItem.tsx
 M apps/web/src/lib/api/browser.ts
 M apps/web/src/lib/api/client.ts
 M apps/web/src/lib/api/index.ts
 M apps/web/src/lib/api/route-table.ts
 M apps/web/src/messages/catalog/en.ts
 M apps/web/src/messages/catalog/es.ts
 M apps/web/src/messages/catalog/pt-BR.ts
 M packages/core/src/asset-jobs/asset-job-policy.ts
 M packages/core/src/asset-jobs/asset-job-store.ts
 M packages/core/src/asset-jobs/asset-jobs.module.ts
 M packages/core/src/asset-jobs/index.ts
 M packages/shared/src/api/asset-jobs.ts
 M packages/shared/src/api/routes.ts
 M packages/shared/src/asset-jobs/asset-job.ts
 M packages/shared/src/asset-jobs/constants.ts
?? apps/api/src/catalog/audio-content.streamer.ts
?? apps/api/src/catalog/template-preview.backfill.ts
?? apps/watcher/src/asset-jobs/template-preview.handler.ts
?? apps/web/src/features/catalog/components/TemplatePreviewHover.module.css
?? apps/web/src/features/catalog/components/TemplatePreviewHover.tsx
?? apps/web/src/features/catalog/hooks/useTemplatePreview.ts
?? packages/core/src/asset-jobs/queries/get-template-preview-file.handler.ts
?? packages/core/src/asset-jobs/queries/get-template-preview-file.query.ts
?? packages/core/src/asset-jobs/queries/get-template-preview.handler.ts
?? packages/core/src/asset-jobs/queries/get-template-preview.query.ts
?? packages/core/src/asset-jobs/template-preview-files.ts
?? packages/core/src/asset-jobs/template-preview-request.ts
?? packages/core/src/asset-jobs/template-preview.enqueuer.ts
?? packages/video/src/render/preview-input.ts
```

`git diff --stat HEAD` (scoped, tracked files):
```
 apps/api/src/catalog/asset-job-view.assembler.ts   |  18 +++-
 apps/api/src/catalog/asset-jobs.controller.ts      |  31 ++++++
 apps/api/src/catalog/catalog-api.module.ts         |   4 +
 apps/api/src/catalog/catalog.controller.ts         |  28 +++++-
 .../api/src/catalog/voice-sample-audio.streamer.ts |  16 ++-
 .../src/asset-jobs/asset-job-file.mapper.ts        |  33 ++++++-
 apps/watcher/src/asset-jobs/asset-job-signals.ts   |   3 +-
 apps/watcher/src/asset-jobs/asset-job-step.ts      |  16 ++-
 apps/watcher/src/asset-jobs/claimed-asset-job.ts   |   3 +-
 apps/watcher/src/asset-jobs/voice-sample.plan.ts   |  17 ++--
 .../src/asset-jobs/watcher-asset-jobs.module.ts    |   2 +
 .../catalog/components/CatalogAssetItem.tsx        |  87 +++++++++++-----
 apps/web/src/lib/api/browser.ts                    |  17 ++++
 apps/web/src/lib/api/client.ts                     |   6 ++
 apps/web/src/lib/api/index.ts                      |   2 +-
 apps/web/src/lib/api/route-table.ts                |   6 ++
 apps/web/src/messages/catalog/en.ts                | 102 ++++++++++++++++++-
 apps/web/src/messages/catalog/es.ts                | 102 ++++++++++++++++++-
 apps/web/src/messages/catalog/pt-BR.ts             | 109 ++++++++++++++++++++-
 packages/core/src/asset-jobs/asset-job-policy.ts   |  19 ++++
 packages/core/src/asset-jobs/asset-job-store.ts    |   2 +
 packages/core/src/asset-jobs/asset-jobs.module.ts  |   8 +-
 packages/core/src/asset-jobs/index.ts              |   7 ++
 packages/shared/src/api/asset-jobs.ts              |  18 ++++
 packages/shared/src/api/routes.ts                  |  21 ++++
 packages/shared/src/asset-jobs/asset-job.ts        |  20 +++-
 packages/shared/src/asset-jobs/constants.ts        |  11 +++
 27 files changed, 640 insertions(+), 68 deletions(-)
```

## Notes
The preview job is typed as mode `live` with $0. It writes no cost record.
