# Contract C9 — toolbox media commands

Owner: ticket R1-10 (SPEC 0002 rev 1). Consumers: R1-14 (stage executors), R1-15 (recipes).
A change to anything below pauses the consumers and goes back to R1-10 (SPEC section 4).

Four TypeScript ports of the Spesia Python tools (D15). No Python runs; every ffmpeg and
ffprobe call goes through `media/exec-tool.ts` `runTool` (`execFile`, fixed argv, no shell).

## Calling convention

| Command | Function | Arguments schema | Result type |
|---|---|---|---|
| `music-bed` | `runMusicBed(tools, args)` | `MusicBedArgsSchema` | `MusicBedResult` |
| `fades` | `runFades(tools, args)` | `FadesArgsSchema` | `FadesResult` |
| `caption-burn` | `runCaptionBurn(tools, args)` | `CaptionBurnArgsSchema` | `CaptionBurnResult` |
| `media-review` | `runMediaReview(tools, args)` | `MediaReviewArgsSchema` | `MediaReviewResult` |

- `tools` is `{ ffmpegPath, ffprobePath }` (`MediaToolPaths`; `ToolboxEnv` satisfies it).
- `args` is `unknown`; each function validates it with its strict zod schema. Numbers may be
  numbers or numeric strings (CLI). Unknown keys are rejected.
- Paths are resolved to absolute paths. Inputs must be existing regular files. Outputs must be
  new `.mp4` paths that differ from every input; nothing is ever overwritten (`-n`).
- Errors: `InputError` for bad arguments or files (nothing written), `ExternalToolError` when
  ffmpeg, ffprobe or Chromium is missing or fails.
- CLI: `ace <command> ...` prints the result as one JSON line on stdout, then the usual
  `{"ok","runId","state","next"}` status line. A failed `media-review` exits 1 after printing.
  Flags are the argument names in kebab case (`--fade-in-s` is `fadeInS`).

## `music-bed`

Loops the music under the whole video, lowers it while speech plays and normalises the mix.

| Argument | Type | Default |
|---|---|---|
| `input`, `output`, `music` | path | required |
| `volume` | number in (0, 2] | `0.25` |
| `fadeInS`, `fadeOutS` | seconds in [0, 60] | `1.0`, `1.5` |
| `duck` | boolean | `true` |
| `loudnessTargetLufs` | number in [-30, -8] | `-16` |
| `truePeakTargetDb` | number in [-9, -1] (loudnorm `TP`) | `-1.5` |

Result: `{ command: 'music-bed', output, durationS, volume, fadeInS, fadeOutS, ducked,
sourceHadAudio, loudnessTargetLufs, truePeakTargetDb }`. Fades are reported as applied (each
clamped to half the duration). Video is stream-copied; audio is AAC 192k, 48 kHz stereo.

## `fades`

Picture fade in from black and out to black. Audio is re-encoded without a fade.

| Argument | Type | Default |
|---|---|---|
| `input`, `output` | path | required |
| `fadeInS`, `fadeOutS` | seconds in [0, 30] | `0.4`, `0.4` |

Result: `{ command: 'fades', output, durationS, fadeInS, fadeOutS }` (fades as applied).

## `caption-burn`

Draws an SRT onto the video as overlaid PNG images rendered by headless Chromium (Playwright).
The SRT is built upstream from narration word timings (SPEC A16).

| Argument | Type | Default |
|---|---|---|
| `input`, `output`, `srt` | path (SRT at most 1 MB, 1-200 cues, 300 chars per cue) | required |
| `verticalAnchor` | number in [0, 1]: caption centre as a fraction of the frame height | required, from the recipe format |
| `style` | `bold` \| `highlight` \| `box` | `bold` |
| `fontFile` | `.ttf` or `.otf` path, at most 20 MB | Arial-first system stack |
| `fontSizePx` | integer in [12, 400] | `max(24, floor(7.5% of the shorter side))` |

Reference anchors from captions.py: top `0.14`, middle `0.5`, bottom `0.74`. Bottom `0.74`
covered app buttons on the 16:9 Spesia tour, which is why the recipe chooses.

Result: `{ command: 'caption-burn', output, captions, style, verticalAnchor, fontSizePx, font }`
(`font` is the font file path or `"default"`).

## `media-review`

| Argument | Type | Default |
|---|---|---|
| `input` | path | required |
| `width`, `height` | integer in [16, 8192] | required, from the recipe format |
| `fps` | number in (0, 240] | required |
| `minDurationS`, `maxDurationS` | seconds, min <= max | required |
| `container` | `mp4` \| `mov` | `mp4` |
| `videoCodec`, `audioCodec` | ffprobe codec name | `h264`, `aac` |
| `loudnessTargetLufs` | number in [-30, -8] | `-16` |
| `loudnessToleranceLu` | number in (0, 6] | `1` |
| `truePeakCeilingDbfs` | number in [-20, 0] | `-1` |
| `maxBlackRunS` | seconds in [0.1, 60] | `1` |

Result:

```ts
{
  command: 'media-review';
  file: string;
  passed: boolean; // every check passed
  checks: { id: MediaCheckId; passed: boolean; expected: string; actual: string }[];
  measured: {
    containerNames: string[];
    durationS: number;
    video: { codec: string; width: number; height: number; fps: number } | null;
    audio: { codec: string; sampleRate: number } | null;
    integratedLufs: number | null;
    truePeakDbfs: number | null;
    blackRuns: { startS: number; endS: number; durationS: number }[];
  };
}
```

`MediaCheckId`, in report order: `container`, `video-codec`, `audio-codec`, `resolution`, `fps`
(tolerance 0.01), `duration`, `audio-present`, `loudness` (within the tolerance of the target),
`true-peak` (at most the ceiling), `no-black-run` (no run longer than `maxBlackRunS`). Every check
is blocking. Without an audio stream, `audio-codec`, `audio-present`, `loudness` and `true-peak`
fail.
