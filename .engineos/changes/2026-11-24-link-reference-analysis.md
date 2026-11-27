---
name: 2026-11-24-link-reference-analysis
status: active
owner: Claude (supervisor) for the owner
spec: docs/specs/2026-11-24-link-reference-analysis-design.md
domain: backend
security_review: pending
risk: high
new_feature: true
release: false
---

## What
Saving a video reference from an Instagram, YouTube or TikTok link now starts the AI analysis of
that video: the watcher fetches the video for a moment, takes 8 frames, sends them to Claude, and
the style text is kept on the reference for the writer and director of later videos.

## Why
The owner asked (2026-11-24, with a screenshot of the "Salvar como referência" form): "when click to
save, it must start a process to analyze the video and create a prompt description about that to
use in other video as reference, so it must go to claude analyze the video and return with a text
and save into this to use later". Until now a link reference was skipped as `link-only`, and the
Claude Code engine refused image analysis.

## Scope
`packages/shared` (link parser, job error code, egress values, download bounds), `packages/core`
(eligibility, Claude Code image call, analyst client), `apps/watcher` (yt-dlp setting, downloader,
handler, job timeout), `apps/web/src/messages/catalog` (texts in pt-BR, en, es), two specs.
Risk high: new network egress to third-party sites, a new external tool, a new Claude call path.

## Checklist
- [x] Owner decisions taken through clickable questions (see Human decisions)
- [x] Proof call: Claude Code read two test frames through a tool-less `claude -p` call
- [x] Design written, with rejected alternatives, frozen contracts and acceptance criteria
- [x] L1 shared: parser, `download-failed`, egress values, `referenceDownloadBounds`
- [x] L2 core: supported links are eligible; Claude Code analyst client; engine choice in the service
- [x] L3 watcher: `YT_DLP_PATH`, downloader, link path in the handler, job timeout
- [x] L4 web: link box help, saved message, failure and link-only texts in three languages
- [x] New link box text seen in the app on the dev server (127.0.0.1:4320)
- [ ] L5 final proof: typecheck, lint, tests, one real link end to end (not run, see Verification)

## What was made
- `@studio/shared/catalog` `video-post.ts`: `videoLinkFrom`, `videoPostUrl` and the `VideoPost`
  types, the allowlist parser the api policy and the watcher now use.
- `AssetJobErrorCodeSchema` gained `download-failed`; the egress line accepts the three platforms
  as provider and `video-download` as what; `referenceDownloadBounds` (120 s, 200 MiB, 10 min,
  720 px).
- `referenceLinkPostOf` and the eligibility rule: a link-only video reference whose provenance URL
  parses as a supported post answers `ok`; any other link stays `link-only`; biometric is still
  refused first.
- `ClaudeCodeAdapter.generateWithImages`: one stream-json user message with the frames as image
  blocks, same isolation as every Claude Code call (no tool, no MCP server, no owner settings);
  `parseStreamEnvelope` reads the final `result` line.
- `ReferenceAnalystClaudeCodeClient`, chosen by `ReferenceAnalystService` under the Claude Code
  engine; the API-key path is unchanged.
- Watcher `downloadReferenceVideo`: one `yt-dlp` run, no shell, minimal environment, no config, no
  cookies, URL rebuilt from the parsed post, bounded by size, duration, height and time.
- `ReferenceAnalysisHandler`: for a link it writes the download egress line, downloads into a
  private scratch folder, samples the frames with the existing guarded ffmpeg path, and the folder
  is removed afterwards; under the Claude Code engine it no longer ends `credential-refused` and
  skips the month-ceiling check; in mock mode it fetches nothing.
- Texts in pt-BR, en and es: the link box says the video is downloaded for a moment and deleted;
  the saved message says the analysis starts next; `download-failed`, `tool-missing` and link-only
  messages.
- Spec `docs/specs/2026-11-24-link-reference-analysis-design.md` with an Amendments section, and a
  superseded note in the guided-creation spec.

## Not done
- Nothing in this change was linted (outside the web), tested or run. The analysis has never been
  seen working, not once. The non-test code compiled in the 2026-11-24 build (see Verification).
- The `yt-dlp` flags were written from memory: the tool is not installed on this Mac, so they are
  untested.
- The web keeps its own copy of the link parser (`features/catalog/video-link.ts`); it does not
  import the shared one yet (the shared package resolves to `dist/` at runtime).
- No test was written for the downloader, the new eligibility rule or the Claude Code image call.
  Tests that build `ReferenceAnalystService` by hand need the new last constructor argument.
- Seen on 2026-11-24 at 127.0.0.1:4320: the reference page's "Análise da IA" card answers
  "Erro 404 (http-404)", so the running api is a build older than the analysis feature itself.
- Critic pass (required at risk high) not run.

## User checklist
- [ ] Install yt-dlp: `brew install yt-dlp` (set `YT_DLP_PATH` to its absolute path if the watcher's
      PATH has no Homebrew folder)
- [ ] Approve typecheck and lint for shared, core, watcher and web, and let the errors be fixed
- [x] Rebuild `packages/shared`, `packages/core`, the api and the watcher (done in the 2026-11-24
      build by the Skills session)
- [ ] Restart the api and the watcher so they run the new build, or install the new disk image
- [ ] Apply the pending guided-creation migration if the asset-job tables are missing
      (`corepack pnpm --filter @studio/core run prisma:migrate:deploy`, on your confirmation)
- [ ] Run with the Claude provider live and `ENGINEOS_VIDEO_CREATOR_CLAUDE_ENGINE=claude-code`
- [ ] Save one real Instagram, YouTube or TikTok link and read the analysis on the reference page
- [ ] Decide on the security review and the critic pass before this ships
- [ ] Repackage the desktop app when the dev build works

## Human decisions
| Date | Who | Reason ids | Decision | Note |
|---|---|---|---|---|
| 2026-11-24 | Ricardo Fagmer | high-risk, external-effect | approved | Video source: "Temporary download (Recommended)". Reverses "Analyse video files only" of 2026-11-23. The option named the platform terms, the blocking risk and that the owner installs yt-dlp. |
| 2026-11-24 | Ricardo Fagmer | high-risk | approved | Claude engine: "Claude Code on this Mac (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Preview: "No preview, build it (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | refused | Final checks (typecheck and lint, 4 packages): "Skip for now". |
| 2026-11-24 | Ricardo Fagmer | none | refused | Tests and browser pass: "Not now (Recommended)". No `test-ready` record was written. |
| 2026-11-24 | Ricardo Fagmer | high-risk | refused | Security review: "Decline security review". The field stays `pending`: no review evidence exists. |

## Verification
[validation] pending — final-stage user approval required

- Build, run by the "Skills page cinema redesign" session at the owner's request (its report, not
  run here): `pnpm exec turbo run build` exit 0, 12 of 12 tasks (2026-11-24); the web step linted
  and type-checked the web. Seen here on disk afterwards: `packages/shared/dist/catalog/video-post.js`,
  `packages/core/dist/agents/reference-analyst/reference-analyst-claude-code.client.js` and
  `apps/watcher/dist/asset-jobs/reference-video.downloader.js`, all dated 2026-11-24 07:25-07:26.
  So the non-test code of this change compiles. The build uses `tsconfig.build.json`: whether the
  two test fixtures compile, lint in shared, core and watcher, and every test remain unchecked.
- Packaged by the same session: `apps/shell/out/dmg/release/EngineOS-Video-Creator-0.1.0-arm64.dmg`
  (545848127 bytes, seen on disk). It holds this change unreviewed and has no yt-dlp.
- Looked at, not a check run: at http://127.0.0.1:4320/catalogo (owner's Chrome, 2026-11-24) the
  link box shows the new help text; no console error on the reference page. Nothing was saved.
- Proof call (2026-11-24, outside the sandbox): `claude -p --input-format stream-json
  --output-format stream-json --verbose --json-schema ... --tools ""` with two test JPEGs, exit 0 in
  4.0 s, `structured_output` named both colours.

## Changes registered
Not a git repository; files listed by hand.

New:
- packages/shared/src/catalog/video-post.ts
- packages/core/src/agents/reference-analyst/reference-analyst-claude-code.client.ts
- apps/watcher/src/asset-jobs/reference-video.downloader.ts
- docs/specs/2026-11-24-link-reference-analysis-design.md

Changed:
- packages/shared/src/catalog/index.ts
- packages/shared/src/asset-jobs/asset-job.ts
- packages/shared/src/asset-jobs/constants.ts
- packages/core/src/asset-jobs/asset-job-policy.ts
- packages/core/src/asset-jobs/index.ts
- packages/core/src/agents/adapters/claude-code-envelope.ts
- packages/core/src/agents/adapters/claude-code.adapter.ts
- packages/core/src/agents/reference-analyst/reference-analyst.service.ts
- packages/core/src/agents/agents.module.ts
- apps/watcher/src/asset-jobs/reference-analysis.handler.ts
- apps/watcher/src/asset-jobs/asset-job-signals.ts
- apps/watcher/src/stages/shared/stage-settings.ts
- apps/watcher/src/stages/__tests__/stage-executors.test.ts (fixture: `ytDlpPath`)
- apps/watcher/src/stages/executors/composition-stage.harness.test.ts (fixture: `ytDlpPath`)
- apps/web/src/messages/catalog/pt-BR.ts
- apps/web/src/messages/catalog/en.ts
- apps/web/src/messages/catalog/es.ts
- docs/specs/2026-11-23-guided-creation-design.md (superseded note)
