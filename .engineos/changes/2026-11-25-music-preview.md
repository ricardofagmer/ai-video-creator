---
name: 2026-11-25-music-preview
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-25-music-preview.md
domain: frontend, backend
security_review: pending  # owner declined the review on 2026-11-25; see Human decisions
risk: medium
new_feature: true
release: false
---

## What
The preset form shows a "Listen" button beside the Music select, like the one beside Voice. It plays the stored audio of the selected music version.

## Why
Owner on 2026-11-25: "as voices music should also be played possible". Music was chosen by name only. No route served stored music bytes: only `image`, `entry-file` and `voice-sample/audio` existed, so a new session-guarded route was needed.

## Scope
- `packages/shared/src/api/routes.ts`: segment `audio`, path `assetAudio`, route table row.
- `packages/core/src/catalog/queries/get-audio-content.query.ts` (new), `get-audio-content.handler.ts` (new), `catalog.errors.ts` (`AudioContentUnavailableError`), `catalog.module.ts`, `index.ts`.
- `apps/api/src/catalog/audio-content.streamer.ts` (new), `catalog.controller.ts` (`GET :assetId/versions/:version/audio`), `catalog-api.module.ts`.
- `apps/web/src/lib/api/route-table.ts` (`catalog.audio`), `browser.ts` and `index.ts` (`storedAudioUrl`).
- `apps/web/src/features/music/components/MusicPreviewButton.tsx` (new).
- `apps/web/src/features/recipes/components/RecipeBindingsSection.tsx`.
- `apps/web/src/messages/catalog/{pt-BR,es,en}.ts`: `musicPreview`.
- `docs/specs/2026-11-25-music-preview.md` (new).

## Checklist
- [x] Core query serves only stored single-file `music` versions that are not biometric
- [x] Api route with `Range`, `nosniff`, no path in logs or errors
- [x] BFF allow-list row
- [x] Button reuses `Button` secondary/sm, `play-circle` icon, the voice wrapper styles and one-at-a-time playback
- [x] Labels in pt-BR, es, en
- [x] `tsc` build of shared, core, api; `tsc --noEmit` of web: no errors
- [x] Web dev server on 4310 (`studio-web-live`); installed web stopped
- [x] Api restarted so the new route is live (pid 50030; `/health` 200; audio route without session 401)
- [x] Seen in the running app (Chrome, 127.0.0.1:4310): button shown with the voice button's classes, `spesia-music-680@1` plays (102 s, `currentTime` advancing, label "Pause"), pause works, no button on "No binding"; `Range: bytes=0-99` answers 206 `audio/mpeg` with `nosniff`
- [ ] Tests and lint: not run, owner chose "Skip for now" on 2026-11-25; no test written for the new route
- [ ] Voice and music pausing each other: not exercised (a voice sample bills the provider)
- [ ] Security review of the new byte route: declined by the owner on 2026-11-25

## Decisions
- New route instead of the voice sample route: music already has its bytes in the store; a job would add cost and delay.
- Cache `private, max-age=86400` like the image route: the blob is content-addressed.
- The guided "Create video" step (`WizardStyleStep.tsx`) has its own Music select, not `RecipeBindingsSection`; left unchanged and reported.

## Human decisions
- 2026-11-25, owner in this session: "Restart api". Api on 4311 restarted once (old pid 41045, new pid 50030), same env.
- 2026-11-25, owner, final checks question: "Skip for now". `[validation] pending — final-stage user approval required`.
- 2026-11-25, owner, security review question: "Decline security review". No reviewer ran; `security_review` left `pending` because no review result exists.

## What was made
The Music row of the preset form has a working "Listen" button. It plays the stored track through `/api/studio/catalog/assets/:assetId/versions/:version/audio`. Verified in the running app on 2026-11-25. Tests, lint and security review were not run. Nothing committed.
