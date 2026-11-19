---
name: fagmer-video-quality-gate
description: Ricardo Fagmer's quality-gate stage for the AI Creator Engine. Does the editorial review of a rendered run in Claude Code (hook clarity, truthfulness, pacing, disclosures, brand safety), writes editorial.json with the SEO package, then runs `ace qa` for the technical checks (duration, 1080x1920, 30 fps, codecs, black frames, silence, licenses). Any blocking defect blocks. Use inside fagmer-video-producer, or when the user asks to "QA the video", or says "fagmer-video-quality-gate".
---

# Fagmer Video — Quality Gate

**Input:** state RENDERED. **Output:** `editorial.json` (`EditorialReviewSchema`) and `qa.json`.
**Hard stop:** any blocking check failed (technical or editorial). The run goes BLOCKED.

## Editorial checks (you write these; `blocking: true` unless marked)

- `hook-clear` — the first 3 s state a concrete pain or outcome.
- `claims-truthful` — every spoken claim is in `claims.json` as supported; nothing overstated.
- `no-fabricated-demo` — no generated visual stands in for a real product result.
- `brand-safe` — no impersonation, no personal data on screen, no third-party logos implying endorsement.
- `disclosures-present` — AI voice and any affiliate disclosure appear on screen and in the caption.
- `pacing` (non-blocking) — no scene over 15 s without a visual change; CTA under 10 s.
- `captions-readable` (non-blocking) — from frames: captions inside the safe zone, ≤ 4 words per line.

## Steps

1. Look at frames (1 s, each scene's midpoint from `narration.json`, last 2 s) and read the script.
2. Run `fagmer-video-seo-package` for the `seo` object.
3. Write `editorial.json` with `schemaVersion: 1`, each check with `passed`, `blocking`, `detail`.
4. `pnpm ace qa <run>`. On BLOCKED, show every failed check with the stage that fixes it, and ask
   by click whether to fix now. On pass the run is in REVIEW.

## Production guide

Judge the editorial checks against `docs/production-guide.md` and name the guide rule in
`detail` when a check fails. Most relevant here:

- `hook-clear`: a question or concrete pain in 0-3 s, with on-screen text and motion.
- `pacing`: every scene moves the story; a scene that does not is a pacing failure even if
  it is under 15 s.
- `captions-readable`: at most two lines, readable for 2.5-4 s, one highlighted word.
- `no-fabricated-demo`: the feature is shown in use resolving the conflict, not described.
- Loudness is not an `ace qa` check in R1; if mixed audio exists, report
  `ffmpeg -af ebur128=peak=true` against -14 LUFS / -1.5 dBTP as a non-blocking note.
