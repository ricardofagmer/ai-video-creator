# Vetting 0003: Spesia Python tools against the TypeScript port (PRD 0001 R4 goal 6, D15)

Date: 2026-11-19. Author: supervisor (R4 offline pieces).
Status: **done, parity recorded, nothing ported** (owner, 2026-11-19: "Record parity only (Recommended)").

Sources: the two Python scripts, read only (never run), and the TypeScript commands in
`packages/toolbox/src/commands/media/`. The comparison was made by reading both sides; no media file
was rendered with either tool, so equal output is inferred from equal ffmpeg arguments, not
measured.

## 1. Where the Python tools are

PRD 0001 section 16 item 1 said the files were not found in `ai-creator-engine`. They live in the
owner's local skill folders, outside every repository:

| File | Lines | SHA-256 on 2026-11-19 |
|---|---|---|
| `~/.agents/skills/fagmer-video-director/scripts/video_tool.py` | 237 | `646e16fd95bf2735b8b0c4c7e05be1c2824be907eb55938bf8594eb1cd8e2fac` |
| `~/.agents/skills/fagmer-video-subtitles/scripts/captions.py` | 226 | `68e04339c8a118f81ab0a19bb227e01ee12254601ccc4abd8d7126d1438cf260` |

Other `fagmer-video-*` skills carry older copies of `video_tool.py`; the director's copy is the
newest and is the one compared. No Python enters the monorepo (D15).

## 2. The four D15 commands: at parity

| Python | TypeScript (`studio media ...`) | Result |
|---|---|---|
| `video_tool.py music` (`mix_music`) | `music-bed.ts` | Same filter chain: music looped with `-stream_loop -1` and cut with `-t` to the video length, `sidechaincompress` threshold 0.03, ratio 8, attack 20, release 400, `amix normalize=0`, `loudnorm` I -16, TP -1.5, LRA 11, same audio format. The port also lets the caller set the true-peak target |
| `video_tool.py motion` | `fades.ts` | Same fade-in and fade-out on picture and sound; both sides clamp the fade to the clip length |
| `video_tool.py review` | `media-review.ts` | Same loudness rule (-16 LUFS plus or minus 1 LU) and true peak at or below -1 dBTP. The port adds format checks and black-frame detection |
| `captions.py burn` | `caption-burn.ts` | Same anchors (top 0.14, middle 0.5, bottom 0.74 of the height), same styles (bold, highlight, box) and same size rule (the larger of 24 px and 7.5% of the shorter side). Works without libass on both sides |

No gap was found inside D15's scope, so goal 6 closes with no code change.

## 3. Subcommands with no TypeScript port (outside D15)

D15 names music, fades, review and caption burn only. These eight are not ported; the owner chose
to record them and port nothing in R4:

| Python | What it does | Nearest thing in the studio today |
|---|---|---|
| `video_tool.py analyze` | Probe streams, list silences | None |
| `video_tool.py rhythm` | Cut silent stretches, keep short padding | None |
| `video_tool.py style` | Brightness, contrast, saturation (`eq`) | None |
| `video_tool.py subtitles` | Draw an SRT with the ffmpeg subtitles filter | `caption-burn.ts` covers the same need |
| `video_tool.py composition` | Overlay a logo, keep the audio | None |
| `video_tool.py render` | Pad to a canvas size, H.264 and AAC MP4 | None |
| `video_tool.py narrate` | Mix a voice track over the video | None |
| `captions.py transcribe` | Speech to timed SRT with whisper.cpp | None; needs whisper.cpp and a model on the machine |

A later release can port any of these. Each port follows the same rule as D15: TypeScript in
`packages/toolbox`, behaviour checked against the file and hash above.

## 4. Revisit when

- Either script's hash changes: compare the changed subcommand again.
- A pipeline step needs one of the section 3 subcommands: port it then, not before.
