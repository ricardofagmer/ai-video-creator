# 09-watcher-sandbox-params-chrome-verify: Watcher: sandbox parameters, Chrome verify before a render, bounded copy (R4H-09)

**What to build:** A HyperFrames render started by the watcher passes the seventeen sandbox parameters as real paths, refuses before any start when the Chrome binary no longer matches `chrome.json` (L1), and stages the template through a copy that follows no link and never reads more than the manifest's size (L3).

**Blocked by:** 08-runtime-sandbox-hardening

**Status:** integrated (2026-11-21, DEGRADED: not compiled yet). U15 was false at integration; the follow-up outside this ticket (2026-11-21) passes both port variables through the launchd template and `scripts/install.sh` step 13

## Requirements
- AC 88 (the watcher part)
- AC 89
- AC 91
- AC 96 (SPEC 0008 section 17.13; findings M1, L1 and L3 of section 17.1)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 17.5, 17.6, 17.8, B11, B12 and U15. Files this touches: `apps/watcher/src/stages/shared/stage-settings.ts` (the two port variables, defaults 4311 and 4310), `apps/watcher/src/stages/process/tool-runner.protocol.ts` (the strict `runtime` object gains nine fields), `apps/watcher/src/stages/composition/hyperframes-preparation.ts` and `hyperframes-stage.ports.ts` (resolution of the parameters and the call to `verifyChromeBinary` in check 1), `apps/watcher/src/stages/process/runner/hyperframes.handlers.ts` (real paths for `nodePath`, `tmpDir` and `templateDir`), `apps/watcher/src/stages/composition/hyperframes-template-copy.ts` (section 17.8).

Protocol addition (frozen in section 17.5):

```typescript
// inside HyperframesRenderRequestSchema.runtime, still .strict()
ownerHomeDir: absolutePath, studioRoot: absolutePath, dataHomeRoot: absolutePath,
hyperframesRoot: absolutePath, chromeDir: absolutePath, ffmpegBin: absolutePath, ffprobeBin: absolutePath,
apiPort: z.number().int().min(1024).max(65535), webPort: z.number().int().min(1024).max(65535),
```

Before coding, read without editing how the watcher process is started (`tools/cli/src/services/service-spec.ts` and the api's launcher) and report whether it receives `VIDEO_STUDIO_API_PORT` and `VIDEO_STUDIO_WEB_PORT` (U15). Do not edit the launcher: it is outside this ticket.

## Acceptance criteria
- [ ] `FFMPEG_BIN` and `FFPROBE_BIN` come from `resolveExecutable` over `StageSettings.ffmpegPath`, `ffprobePath` and `path`; `NODE_BIN` is the real path of `process.execPath`; no parameter is read from `process.env` outside `readStageSettings` (AC 88).
- [ ] The `runtime` object is strict with the nine new fields; an unresolvable ffmpeg or ffprobe, home, root or port stops the stage as `needs-person` with `sandbox-unavailable`, a missing `cache/`, `config/` or `home/` with `runtime-not-prepared`, each with zero starts (AC 89).
- [ ] After `engineState` answers `ready` and before any child starts, every HyperFrames render calls `verifyChromeBinary`; a failure refuses with `chrome-missing`, zero starts and one `hyperframes.render-refused` event (AC 91).
- [ ] The staged copy opens each source once with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, requires a regular file of the manifest's `sizeBytes`, stream-copies at most that many bytes into an exclusively created `0600` target, and compares the hash of the bytes it read; `copyFile` is gone (AC 96).
- [ ] The stage texts, the refusal reason ids and the child environment are unchanged.

## Testing requirements
None in this ticket, and none in this wave (SPEC 0008 K17, owner decision OD8). Do not add or edit a test file; existing watcher tests that the new protocol fields or the frozen argv break are updated by ticket 12. This ticket starts no process and reads no real data home.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `process.env` spread, no secret literal in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `apps/watcher/package.json`, to a test file, to `packages/**`, to `tools/**`, to SPEC 0008 or to a ticket file.
- [ ] No log line, event or runner reply carries a path, a hash, a port or child stderr (SPEC 0008 K12).
- [ ] The U15 reading is reported with the files and lines read.
- [ ] No check, build, test, install, render or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `apps/watcher` except `package.json` and `**/*.test.ts`
- dependsOn: 08-runtime-sandbox-hardening
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` section 17 (rev 2, once frozen); the `@studio/hyperframes` API delivered by 08
