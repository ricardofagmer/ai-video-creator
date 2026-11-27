# Link reference analysis: design

Date: 2026-11-24. Owner: Ricardo Fagmer. Risk: high (new network egress to third-party sites, a new
external tool, a new Claude call path). Amends `docs/specs/2026-11-23-guided-creation-design.md`
section 4, whose "Out of scope" listed the analysis of link-only references.

## Problem

Saving a video reference from an Instagram, YouTube or TikTok link keeps only the link. The analysis
that runs on save (guided-creation section 4) skips it as `link-only`, so the reference never gets
the style text the writer and director use. The owner asked (2026-11-24): "when click to save, it
must start a process to analyze the video and create a prompt description about that to use in other
video as reference, so it must go to claude analyze the video and return with a text and save into
this to use later".

## Owner decisions (clickable questions, 2026-11-24)

- Video source: "Temporary download (Recommended)". This reverses "Analyse video files only" of
  2026-11-23. The option named the cost: Instagram and TikTok terms do not allow automated
  downloads, Instagram often blocks them, and `yt-dlp` must be installed by the owner.
- Claude engine: "Claude Code on this Mac (Recommended)". The frames go to the installed CLI on the
  owner's subscription; no API key and no per-call bill.

## Proof call (2026-11-24)

```
claude -p --input-format stream-json --output-format stream-json --verbose --json-schema <schema>
       --system-prompt <text> --model sonnet --tools "" --strict-mcp-config --setting-sources ""
       --no-session-persistence          (one user message with two base64 JPEG image blocks on stdin)
```

Observed (**Fact**): exit 0 in 4.0 s, 2 turns, no tool available; the last stdout line is
`{"type":"result","subtype":"success","structured_output":{"colours":["red","blue"]},"usage":{...}}`,
so the model saw both frames. `--input-format stream-json` with `--output-format json` is rejected
("requires output-format=stream-json"). Inside the command sandbox the call fails at sign-in, as ADR
0011 recorded.

## Chosen approach

1. **One link parser for the server side.** `videoLinkFrom`, `videoPostUrl` and the `VideoPost` types
   live in `@studio/shared/catalog` (`video-post.ts`); the api policy and the watcher use that one
   allowlist. The web keeps its own copy in `features/catalog/video-link.ts` for now (see
   Amendments): the two must stay identical until the web imports the shared one.
2. **Eligibility.** `referenceAnalysisEligibility` answers `ok` for a link-only video reference whose
   provenance URL parses as a supported post. Any other link stays `link-only`. Biometric is still
   checked first. The save-time enqueuer needs no change: it already asks the policy.
3. **Download in the watcher.** For a link the handler rebuilds the post URL from the parsed parts
   (never the stored text), writes one egress line (`provider` = the platform, `what` =
   `video-download`), and runs `yt-dlp` once into the job's private scratch folder: no shell, minimal
   environment, `--ignore-config`, no cookies, no playlist, at most 720 px, at most 200 MB, videos up
   to 10 minutes, 120 s timeout joined to the job signal. The frames are sampled from that file with
   the existing guarded ffmpeg path, and the folder is removed in `finally`. The video never enters
   the catalog.
4. **Claude Code analyst.** Under the Claude Code engine the analyst sends the redacted text and the
   labelled frames as one stream-json user message to `claude -p` with no tool, no MCP server and no
   owner settings (ADR 0011 isolation), and reads the final `result` line. The answer still passes
   `ReferenceStyleAnalysisSchema` and the output scan. The handler no longer ends
   `credential-refused` under this engine and skips the month-ceiling check there (the price is 0).
   The API-key path is unchanged.
5. **Screen texts.** The link box says the video is fetched for a moment to be analysed and then
   deleted. The reference page already shows waiting, done and failed states; it gains the
   `download-failed` message.

### Rejected alternatives

- **Cover image and caption only.** No download and no new tool, but Claude would see one picture:
  no cuts, pacing or hook. The owner asked for the video to be analysed.
- **Give Claude Code the Read tool on the frame folder.** Works without stream-json, but a tool that
  reads files is a wider grant than image blocks in the message; ADR 0011 keeps every call tool-less.
- **Keep the downloaded video as the reference file.** Would make the reference playable offline, but
  stores third-party content and reverses the 2026-11-23 "nothing is downloaded" decision further
  than asked.
- **Download in the api at save time.** The save must not wait on the network, and the watcher
  already owns every external tool and the job queue.

## Contracts (frozen)

- `@studio/shared/catalog`: `VideoPlatform`, `InstagramPostFormat`, `VideoPost`, `VideoLink`,
  `videoLinkFrom(value)`, `videoPostUrl(post)`. Behaviour identical to the web's current parser.
- `AssetJobErrorCodeSchema` gains `download-failed` (failed). `tool-missing` now also means `yt-dlp`
  is not installed.
- `AssetJobEgressLineSchema`: `provider` gains `instagram`, `youtube`, `tiktok`; `what` gains
  `video-download` (amount 1).
- `referenceDownloadBounds` (`@studio/shared/asset-jobs`): `timeoutMs` 120 000, `maxFileBytes`
  200 MiB, `maxDurationSeconds` 600, `maxHeightPx` 720.
- Watcher setting `YT_DLP_PATH` (optional, absolute); unset resolves `yt-dlp` on the runtime PATH.
- `ReferenceAnalysisEligibility` values are unchanged; `link-only` now means "a link that is not a
  supported post".
- All additive: `API_CONTRACT_REVISION` stays as it is.

## Security notes

- The stored link is untrusted text: it is parsed again in the watcher, the host must be on the
  allowlist, and only the rebuilt canonical URL reaches `yt-dlp`, after `--`.
- `yt-dlp` gets no cookies and no browser session, so it can only fetch what is public.
- The downloaded file is untrusted media: ffmpeg reads it through the runner's guard
  (`-protocol_whitelist file`, demuxer allowlist), as stored blobs are.
- Frames of a third-party video can carry hostile on-screen text: the analyst has no tools, the
  answer is schema-bounded and scanned, and it reaches the writer and director as delimited data.
- Biometric references are refused before anything is downloaded.
- Logs carry the ref, the platform, counts and codes only: never the URL, a path or a frame.

## Acceptance criteria

- AC1. Saving a link reference from Instagram, YouTube or TikTok creates one `reference-analysis`
  job; the save answers without waiting for it.
- AC2. With `yt-dlp` installed and the Claude Code engine live, the job ends `done` with the style
  analysis, and the reference page shows it.
- AC3. Without `yt-dlp` the job ends `failed` / `tool-missing`; a blocked, private or removed post
  ends `failed` / `download-failed`; both show their reason and the "analyse again" button.
- AC4. After the job no downloaded video or frame remains on disk.
- AC5. A link that is not a supported post still shows the link-only note; a biometric reference is
  refused before any download.
- AC6. A run that uses the reference hands the analysis to the writer and director (unchanged path).
- AC7. Under the API-key engine and in mock mode the analysis behaves as before.

## Tickets

- L1 shared: link parser, error code, egress values, download bounds.
- L2 core: eligibility for supported links; Claude Code analyst client; engine choice in the service.
- L3 watcher: `YT_DLP_PATH`, downloader, link path in the handler, job timeout, Claude Code gate.
- L4 web: link box text, saved message, `download-failed` and link-only texts in pt-BR, en, es.
- L5 final proof (final gate, owner approval): typecheck, lint, tests, one real link end to end.

Dependencies: L1 before L2, L3 and L4; L2 before L3. L5 last.

## Out of scope

- Speech transcription, reading the post's caption, keeping the downloaded video.
- Installing `yt-dlp`, rebuilding or restarting the api and watcher, repackaging the desktop app.
- A draft Prompt asset per video: the text stays on the reference, as decided on 2026-11-23.

## Amendments (2026-11-24, while building)

- **The web parser stays a copy.** `@studio/shared` resolves to `dist/` at runtime, so a runtime
  import of the new shared parser from the web would fail until the shared package is rebuilt, and
  the dev server was in use. `apps/web/src/features/catalog/video-link.ts` is unchanged. Follow-up:
  after the next shared build, make the web file re-export the shared parser and delete its copy.
- **`YT_DLP_PATH` is read in packaged mode too.** `yt-dlp` is not bundled with the desktop app, so
  the packaged watcher resolves it from this setting or from its PATH, unlike the bundled tools.
- **Mock mode fetches nothing.** With the Claude provider in mock mode a link job downloads no video
  and samples no frame; the analyst's labelled stand-in answer is stored, as for stored videos.
- **Saved message.** The link form's saved message now says the AI analysis starts next and where
  its text shows.

## Rollback

Revert the eligibility rule (links answer `link-only` again): no job is created for links, nothing
is downloaded, and existing job files stay readable. No data migration.
