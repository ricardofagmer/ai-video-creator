---
name: fagmer-video-voiceover
description: Ricardo Fagmer's voiceover stage for the AI Creator Engine. Generates the English narration with ElevenLabs (with character timestamps, for captions and scene timing) through `ace narrate`, checks it matches the approved script and lands at 69–90 seconds. Use inside fagmer-video-producer, or when the user asks to "narrate the video", "make the voiceover", or says "fagmer-video-voiceover".
---

# Fagmer Video — Voiceover

**Input:** validated `script.json`, state ASSETS_READY.
**Output:** `narration.mp3` (or `narration.wav` in mock mode) and `narration.json`
(`NarrationManifestSchema`: word timings and per-scene timings).
**Hard stop:** duration outside 69–90 s; spoken text differs from the approved narration.

## Steps

1. Voice choice by click on the first run (then reuse): the ElevenLabs voice id in
   `ELEVENLABS_VOICE_ID`, or offer to list voices. Keep one voice for the channel's identity.
2. The key is read from `ELEVENLABS_API_KEY` in `$ENGINE/.env` or the shell. If missing, tell the
   user to add it there; never ask for the key in chat and never write it anywhere.
3. Live: `PROVIDER_VOICE=live pnpm ace narrate <run>`. Mock (no credits): `pnpm ace narrate <run>`.
   Tell the user the narration text is sent to ElevenLabs before the first live call.
4. If BLOCKED on duration: too long → cut words in the least important step scene; too short →
   add a concrete detail. Edit `script.json`, re-validate the script, narrate again.
5. Read `narration.json`: words count equals the script's, the first word starts under 0.5 s.
   You can't hear it: give the user the first-word and last-word timestamps to check.

## Production guide

Follow `docs/production-guide.md` section 4. For this stage (R1 is narration only; no music
bus exists in the R1 code):

- Silence is planned, never accidental: one deliberate pause at most, and `ace qa` fails any
  silence over 2 s at -50 dB.
- Sound before image (J-cut): a line may start a moment before its scene's picture changes.
- Sync only what tells the story; do not time narration to every visual change.
- Delivery target for any mixed audio: -14 LUFS integrated, true peak <= -1.5 dBTP; `ace qa`
  does not measure loudness for R1, so check with `ffmpeg -af ebur128=peak=true` and report
  the numbers.
