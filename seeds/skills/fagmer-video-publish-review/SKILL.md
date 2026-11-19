---
name: fagmer-video-publish-review
description: Ricardo Fagmer's publish-review stage for the AI Creator Engine. Builds a small review copy with `ace preview`, publishes a private Claude artifact review page (player, script, claims with sources, asset provenance, QA, costs, caption), asks the 8-item publish checklist and the approve/reject decision by click, and records it with `ace approve`. Never posts to TikTok. Use inside fagmer-video-producer, or when the user asks to "review the video", "approve the video", or says "fagmer-video-publish-review".
---

# Fagmer Video — Publish Review

**Input:** state REVIEW. **Output:** `preview.mp4`, a private review artifact, `approval` in `run.json`.
**Hard stop:** no explicit approval. Without all 8 checklist items there is no APPROVED.

## Steps

1. `pnpm ace preview <run>` (720x1280, under 12 MB).
2. Build the review page with the Artifact tool (load its design guidance first). Upload
   `preview.mp4` and `thumbnail.png` as artifact assets and show: the player, title and caption
   with hashtags and disclosures (copy buttons), hook and narration, scene list, every claim with
   its quote and source link, asset provenance and licenses, QA checks (blocking failures first),
   modeled cost per stage and total, and the state timeline from `run.json`. Keep it private; give
   the user the link.
3. Ask by click, in one call: the 8 checklist items (multi-select, labels from
   `references/quality-checklist.md` of fagmer-video-producer), then the decision (Approve /
   Reject with reason / Fix something first). Tell them approval does not post anything.
4. `pnpm ace approve <run> --decision APPROVED|REJECTED --reviewer "<name>" [--reason "..."] --checklist claimsVerified=true,...`
   using exactly the ticked items.
5. On approval: the user uploads `video.mp4` in TikTok Studio with the caption from `qa.json`,
   turns on the AI-generated content label, and checks the account and visibility. Offer to
   record the TikTok URL later for `fagmer-video-analytics-loop`.
