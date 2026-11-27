---
name: 2026-11-25-site-capture-visual-media
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-25-site-capture-and-visual-media-design.md
domain: general
security_review: pending
preview: declined
risk: medium
new_feature: true
release: false
---

## What
A video made from a site asks the owner "use screenshots of the site in the video?", and a run with no site capture, no image and no video clip is refused.

## Why
Owner rule 2026-11-25: "when working with sites, we should ask to the user, should i use screenshot of the site to create a video? then use it otherwise do not allow videos without images or even another video". Run `01M89HKZJZ23NVBQ1HB8TBAW44` had no site address and no picture: every scene was a text card.

## Scope
- `packages/shared`: `Brief.siteCapture`, `recipes/visual-media.ts`, `recipeForBrief` switches `capture` on for a yes.
- `packages/core`: `RunDraftService.assertPictures`, three run errors.
- `apps/watcher`: `capture.executor.ts` follows the answer; owner texts.
- `apps/web`: question in `RunBriefFields`, `buildBrief`, wizard draft and review, texts in pt-BR, es and en.

## Checklist
- [x] Spec written and approved
- [x] Shared rule and brief field
- [x] Core refusal
- [x] Watcher capture stage
- [x] Web question and texts
- [x] Builds and visible check in the app (new video form; refusal paths only)
- [ ] Final checkpoint (typecheck, lint, tests)
- [ ] Security review

## What was made
- Shared: `SiteCaptureAnswerSchema` and optional `Brief.siteCapture`; `visualMediaProblem` and `isPicture`; `recipeForBrief` enables `capture` when the answer is `use`.
- Core: `RunDraftService.create` counts pictures among the run's references and the preset's bound assets and throws `SiteCaptureUnansweredError`, `SiteCaptureDisabledError` or `RunWithoutPicturesError`.
- Watcher: `capture` records nothing when the answer is `skip`; a live page that still cannot be recorded on the second attempt stops for a person.
- Web: a required choice under the site address (new video form, wizard, comparison, curation, schedule brief and fix dialog share `RunBriefFields`); the wizard review shows the answer; three refusal sentences in three languages.

- Seen in the app (2026-11-25, owner: "Build and restart", "Signed in, continue"): `@studio/shared`, `@studio/core`, `@studio/api` and `@studio/watcher` built without errors; API and watcher restarted from the new `dist`; web dev server `studio-web-live` on 127.0.0.1:4310. On `/execucoes/nova` with preset `carrinho-completo-9x16@11`: typing a site address shows "Use screenshots of the site in the video?"; "Start run" with no answer shows "Answer whether the screenshots of the site go in the video."; answer "No, do not show the site" with no reference shows the server refusal "The video would have no picture at all. ...". No run was created (36 run folders before and after).
- Yes path (2026-11-25, owner: "Yes, run it"): run `01M89W2BNWQ3Z2ZM9KDK1CAMDT` from `/execucoes/nova`, `sourceUrl` `https://example.com`, `siteCapture: use`, target 25 s, no reference. It reached `review`; `capture` recorded live ("Gravação de example.com", 20 s) and all four scenes use `capture-1`.

## Not done
- No typecheck, lint or test has run (only the four package builds).
- Not exercised: the capture-failure stop, the wizard and the other forms that share `RunBriefFields`, scheduled and comparison refusals.
- Existing tests and fixtures that create runs with no picture are expected to fail until they carry one; none was changed.
- Login wall detection (owner: "Not now (Recommended)").

## Verification
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-25 | Ricardo Fagmer | design choices | approved | "Both (Recommended)"; "Before the run starts (Recommended)"; "Keep screen recording (Recommended)"; "Stop and ask me (Recommended)"
- 2026-11-25 | Ricardo Fagmer | spec approval | approved | "Approve (Recommended)"; coverage "Refuse everywhere (Recommended)"; login wall "Not now (Recommended)"; preview "No preview, build (Recommended)"
- 2026-11-25 | Ricardo Fagmer | final checks | skipped | "Skip for now": typecheck, lint and tests stay pending

## Changes registered
<filled on completion>
