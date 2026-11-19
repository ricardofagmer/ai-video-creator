---
name: fagmer-video-tiktok-render
description: Ricardo Fagmer's TikTok render stage for the AI Creator Engine. Renders the run with the Remotion templates (Tool Demo, AI Battle, Automation Blueprint) to a 1080x1920, 30 fps H.264/AAC MP4 plus thumbnail through `ace render`, then inspects frames. Different from fagmer-video-render, which pads an existing video to a canvas. Use inside fagmer-video-producer, or when the user asks to "render the TikTok", or says "fagmer-video-tiktok-render".
---

# Fagmer Video — TikTok Render

**Input:** state NARRATED with `assets.json` and `narration.json`.
**Output:** `video.mp4`, `thumbnail.png`, `render.json`.
**Hard stop:** render error (run goes FAILED; `pnpm ace retry <run>` after fixing the cause).

## Steps

1. `pnpm ace render <run>`. It serves the run folder on 127.0.0.1 only for the render and
   builds the Remotion input from the manifests; nothing is uploaded.
2. Extract frames at 1 s, the middle, and 2 s before the end:
   `ffmpeg -ss <t> -i video.mp4 -frames:v 1 /tmp/frame-<t>.png`, and look at each: captions inside
   the safe zone, text not clipped, the scene matches its narration, no blank scenes.
3. To tweak the look, open `pnpm studio` in `$ENGINE` and adjust `packages/video`, then re-render.
4. Report render seconds and file size. Say you judged frames, not motion.

## Production guide

When changing `packages/video`, follow `docs/production-guide.md` sections 3 and 5:

- Every cut and transition has a motive (emotion, then story, then rhythm); no decorative
  transitions.
- The camera never fully stops; zoom keeps the interface legible; vary pacing.
- Cursor eases to its target and clicks; pressed buttons darken and shrink.
- Before a full render, tile half-scale stills per section into a contact sheet and fix
  text on text, misaligned boxes and markers out of frame.
- Known pitfalls: `perspective` blurs zoomed text; `text-shadow` in `overflow: hidden`
  columns draws boxes (use `filter: drop-shadow` on the parent); GL transitions miss nested
  WebGL; React hooks before any early `return`.
