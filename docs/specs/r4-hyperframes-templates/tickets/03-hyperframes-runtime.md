# 03-hyperframes-runtime: Runtime: process contract, sandbox profile, pinned binary (R4H-03)

**What to build:** `@studio/hyperframes` can render a picture from a staged template folder through one port, with the pinned binary, the closed environment and the sandbox, and nothing else can start a HyperFrames process.

**Blocked by:** 01-frozen-contracts, 02-dependency-install

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 66
- AC 67
- AC 68
- AC 69 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 4.4, 4.5, 4.6, 5.5 and U2, U4. Before coding, read (never run) the installed 0.9.72 bundle for: the config module that reads `HYPERFRAMES_CONFIG_DIR` (to learn the minimal `config.json` and what triggers the copy from `~/.hyperframes`), the `browser ensure` command, and the readers of `HYPERFRAMES_CACHE_DIR` and `HYPERFRAMES_BROWSER_PATH`; report any drift from SPEC 0008 section 4.5 before writing code. Deliver in `packages/hyperframes/src/**`: `pinnedBinPath()` (real path inside the workspace, version asserted against `HYPERFRAMES_PIN`, `HyperframesPinMismatchError`); `buildRenderEnv` and `buildRenderArgv` (pure, exactly the eleven keys and the frozen argv); `sandboxProfile()` (path and sha-256 of `sandbox/render.sb`); `HyperframesProcessPort`, its real adapter (`spawn`, no shell, explicit `cwd` and `env`, stderr left on the parent's stderr) and an exported in-memory fake for tests; `renderPicture`; `prepareConfigDir` (writes the minimal `config/config.json`, `0600`, only if absent); `ensureBrowser` (the `browser ensure` start of section 5.5, unsandboxed, the same environment without `HYPERFRAMES_BROWSER_PATH`) and `locateInstalledChrome` (exactly one `chrome-headless-shell` under a folder naming `158.0.8127.36`, hashed). Deliver `packages/hyperframes/sandbox/render.sb` with the text of section 4.6.

## Acceptance criteria
- [ ] The only `spawn` in the package is in the real adapter; `renderPicture`, `ensureBrowser` and every caller go through the port (AC 66).
- [ ] `buildRenderEnv` reads no `process.env`; its result has exactly the keys of SPEC 0008 section 4.5 (AC 67).
- [ ] A version other than 0.9.72 under `node_modules/hyperframes` throws before any start (AC 68).
- [ ] `renderPicture` never calls `ensureBrowser`; `ensureBrowser` is exported for the CLI only and is not imported by `apps/watcher` (AC 69).
- [ ] A missing `/usr/bin/sandbox-exec` is reported as `sandbox-unavailable`, never worked around by starting unsandboxed.
- [ ] The profile allows no non-loopback address and denies the owner's `~/.hyperframes`; any exception is written as a comment in the file with its reason, for the owner to see in the trace findings.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof). Keep the code testable: everything except the real adapter is pure or takes the port. This ticket starts no process: not `hyperframes`, not `sandbox-exec`, not Chrome.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `npx`, no `shell: true`, no `process.env` spread, no secret literal, no network call in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `packages/hyperframes/package.json`, the PRD, SPEC 0008 or the ticket files.
- [ ] Errors and return values carry reason ids and exit codes only: no path, no variable value, no child stderr (SPEC 0008 K12).
- [ ] No check, build, test, install, download, render or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `packages/hyperframes/src` (after 02 created `index.ts`), `packages/hyperframes/sandbox`
- dependsOn: 01-frozen-contracts, 02-dependency-install
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/adr/0008-hyperframes-templates.md`, `docs/vetting/0004-hyperframes-spike.md`, `docs/vetting/0005-hyperframes-dependency.md`
