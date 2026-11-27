---
name: 2026-11-25-run-finish-autoplay-outcome
status: active
owner: Ricardo Fagmer
spec: n/a — Fast change chosen by the owner (simple-task choice), small low-risk frontend behavior
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
When a run finishes while its page `/execucoes/[runId]` is open, the browser goes to the review page and the outcome video plays by itself.

## Why
The owner asked: "when execucoes get completed, redirect to the outcome video and play it".

## Scope
- `apps/web/src/features/runs/components/RunLiveView.tsx`
- `apps/web/src/app/(studio)/execucoes/[runId]/revisao/page.tsx`
- `apps/web/src/features/review/components/ReviewVideoCard.tsx`
- `apps/web/src/features/review/components/BiometricVideoPlayer.tsx`
- `packages/ui/src/components/review/VideoPlayer.tsx`
- `packages/ui/src/index.ts`

## Checklist
- [x] Redirect once when the polled state turns reviewable (`hasReview`) after the page saw it unfinished
- [x] `?reproduzir=1` on the review page enables autoplay
- [x] `autoPlay` prop on both players, with a muted retry when the browser blocks sound
- [x] Visible check in Chrome on 4310: `?reproduzir=1` plays the video (muted fallback on a direct load, `preload=auto`); the in-run redirect itself was not watched live

## What was made
- `RunLiveView` remembers whether the run was unfinished at load. When the live state becomes reviewable it calls `router.push('/execucoes/<id>/revisao?reproduzir=1')` once. A run opened already finished does not redirect.
- The review page reads `searchParams.reproduzir === '1'` and passes `autoPlay` to `ReviewVideoCard`, which forwards it to `VideoPlayer` and `BiometricVideoPlayer`.
- `@studio/ui` exports `startPlayback(video)`: it calls `play()`, and on refusal sets `muted` and retries; a second refusal leaves the native controls. Both players run it on mount when `autoPlay` is set, with `preload="auto"`.
- A `withheld` video renders no player, so nothing plays there; the redirect still happens.

## Not done
- The redirect at run finish was not watched live (needs a run finishing while its page is open).
- Typecheck/lint/tests: not run (final checkpoint answered `checks: ask`; no approval given yet).

## User checklist
- [ ] Sign in on the 4310 Browser pane tab so the redirect and autoplay can be checked visibly
- [ ] Approve or skip the final checks (web and ui `tsc --noEmit`, lint)

## Verification
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-25 | Ricardo Fagmer | none fired (risk low) | approved | Simple-task choice: "Fast change (supervisor)"
- 2026-11-25 | Ricardo Fagmer | none fired (risk low) | deferred | Final checks (web and ui `tsc --noEmit`, lint): "Skip for now"

## Changes registered
```
 M apps/web/src/app/(studio)/execucoes/[runId]/revisao/page.tsx
 M apps/web/src/features/review/components/BiometricVideoPlayer.tsx
 M apps/web/src/features/review/components/ReviewVideoCard.tsx
 M apps/web/src/features/runs/components/RunLiveView.tsx
 M packages/ui/src/components/review/VideoPlayer.tsx
 M packages/ui/src/index.ts

 .../(studio)/execucoes/[runId]/revisao/page.tsx    |  7 +++++--
 .../review/components/BiometricVideoPlayer.tsx     | 15 +++++++++++----
 .../features/review/components/ReviewVideoCard.tsx |  7 +++++--
 .../src/features/runs/components/RunLiveView.tsx   | 13 ++++++++++++-
 packages/ui/src/components/review/VideoPlayer.tsx  | 22 ++++++++++++++++++++--
 packages/ui/src/index.ts                           |  2 +-
 6 files changed, 54 insertions(+), 12 deletions(-)
```

## Notes
- 2026-11-25: the review page rendered unstyled (a 1232px hero glyph) because a second `next dev` on 4320 shared `apps/web/.next` and replaced the 4310 manifests, so page CSS chunks returned 404. Fixed by stopping 4310, clearing `apps/web/.next` and restarting `pnpm dev`. No code change.
- The 4320 dev api cannot start while the installed api holds 4311; checks run on the 4310 `studio-web-live` dev server. See [[web-build-breaks-dev-server]].
