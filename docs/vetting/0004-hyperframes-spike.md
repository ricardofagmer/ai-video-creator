# Vetting 0004: HyperFrames feasibility spike (PRD 0001 R4 goal 5)

Date: 2026-11-19. Author: supervisor (R4 offline pieces).
Status: **pass, with conditions** (owner, 2026-11-19: "Spike decides (Recommended)"). Template
support may be built next to Remotion; it starts with the dependency vetting in section 5, which
needs the owner's approval before any package enters the monorepo. Remotion stays the default.

Sources: `hyperframes` **0.9.58** (Apache-2.0, `github.com/heygen-com/hyperframes`,
`packages/cli`), the copy already in the npx cache on the owner's Mac, run directly from that cache.
Nothing was installed or downloaded for the spike; the Chrome headless shell it uses
(`chrome-headless-shell` mac-arm64 152.0.7977.30) was already in `~/.cache/hyperframes/chrome`. All
spike files were written to the session scratchpad, not the repository. The registry reports
0.9.71 as latest on 2026-11-19; no other version was tried.

## 1. What was tried

A 3-second, 1080x1920, 30 fps composition (one background clip, one title clip with a CSS
animation) declaring two variables, `headline` (string, pt-BR text with accents) and `accent`
(color), rendered with:

```
HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_SKIP_SKILLS=1 \
HYPERFRAMES_CONFIG_DIR=<scratch> hyperframes render \
  --variables-file vars.json --strict-variables --strict --crf 18 -o out.mp4
```

## 2. Results

| Question | Result |
|---|---|
| Renders locally with no account | Yes. `doctor` found Node 24.21.0, FFmpeg 9.0.2 and the cached Chrome |
| Output matches the studio's render contract (H.264, yuv420p, CRF 18) | Yes: `h264`, 1080x1920, `yuv420p`, 30/1, duration 3.000000 (ffprobe). AAC applies when the composition has sound (not exercised) |
| Props from the studio reach the template | Yes, as variables: the frames show the pt-BR headline with accents and the `#f97316` accent. `--strict-variables` refuses undeclared or wrongly typed values |
| Motion renders frame-accurately | Yes: frames at 0.2 s and 2.8 s show the title at the start and end of its CSS animation |
| Speed | 3.0 s of video in 4.7 s (first run) and 3.1 s (second), 3 Chrome workers |
| Thumbnail | No `renderStill` equivalent in the run; one frame taken with ffmpeg (as `media-review` already does) or `hyperframes snapshot` |
| Programmatic API | None for rendering. The package's `./api` export covers media helpers (transcribe, remove background) only. The studio calls the CLI as a child process, the same kind of process contract as the local voice |
| Telemetry | **On by default.** `HYPERFRAMES_NO_TELEMETRY=1` (or `DO_NOT_TRACK=1`) turns it off; `telemetry status` confirmed `disabled`, source the env var |

## 3. Conditions for template support

Each condition is a requirement on the build, not a reason to reject:

1. **Pinned and vetted.** The package is pre-1.0 and moves fast (0.9.53, 0.9.56 and 0.9.58 were
   all in the cache within days; 0.9.71 is out). Pin an exact version and vet it the way
   `docs/vetting/0002-shell-runtime.md` vetted Electron (section 5).
2. **Every child process gets the privacy env:** `HYPERFRAMES_NO_TELEMETRY=1`,
   `HYPERFRAMES_NO_UPDATE_CHECK=1`, `HYPERFRAMES_SKIP_SKILLS=1`, and a studio-owned
   `HYPERFRAMES_CONFIG_DIR` under the data home. Without the config dir the CLI reads the
   owner's `~/.hyperframes`, which holds a HeyGen `credentials` file. On its first run with a new
   config dir the CLI copied the owner's `config.json` (settings and an anonymous id, not the
   credentials) into it; the build seeds the dir itself so nothing is copied.
3. **Templates are self-contained.** The scaffold loads GSAP from `cdn.jsdelivr.net`, and the font
   compiler fetches non-bundled weights from Google Fonts. Studio templates ship GSAP and every
   font file inside the template folder and render with `--strict`, so a render never reaches the
   network.
4. **Flat props only.** Variables are typed scalars (`string`, `number`, `color`, `boolean`,
   `enum`). A HyperFrames template's `inputSchema` is generated from its declared variables, and
   its `sceneSchema` is `null` (the catalog already allows `engine: 'hyperframes'` and a null
   scene schema). A template that needs a scene list stays on Remotion.
5. **Every root declares `data-no-timeline` or registers `window.__timelines`**, or the producer
   waits up to 45 s for a timeline on every render (lint `missing_data_no_timeline`).

## 4. Not verified

- That `HYPERFRAMES_NO_UPDATE_CHECK=1` stops the network check: the stored `lastUpdateCheck` did
  not move on the second run, but the check may also be throttled. A network trace in the
  section 5 vetting settles it.
- Audio (narration, music bed) through a HyperFrames render, and `render --docker` determinism.
- Render time for a full 30 to 60 s short.

## 5. Next step: dependency vetting

Before any code: registry identity and provenance of `hyperframes` at the chosen pin, its
dependency tree (it pulls `@puppeteer/browsers`, `esbuild`, `hono`, `adm-zip`, `giget` among
others; about 108 MB unpacked as cached), lifecycle scripts, the Chrome download host and size
(about 195 MB cached), and a network trace of one render under the section 3 env. The owner
approves the pin before it is added.
