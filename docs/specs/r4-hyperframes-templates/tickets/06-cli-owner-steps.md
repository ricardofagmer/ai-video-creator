# 06-cli-owner-steps: CLI: status, Chrome install, network trace, enable and disable (R4H-06)

**What to build:** The owner's commands for the three gated steps (install Chrome, trace the network, enable the engine), plus status and doctor lines that say which step is next.

**Blocked by:** 03-hyperframes-runtime, 05-catalog-seed-template (the trace renders the seed template)

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 69
- AC 70
- AC 84
- AC 85 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 5.5, 5.6, 7 and U3, U4. Commands under `studio hyperframes`:
- `status`: pin, Node version, Chrome, config, trace, engine state and the next step; read-only.
- `chrome install` (**owner-run step O2**): terminal only; prints build, size, host and destination; the owner types `158.0.8127.36`; then `prepareConfigDir`, `ensureBrowser`, `locateInstalledChrome`, and `chrome.json`. Fails closed and writes nothing on zero or several matches.
- `trace` (**owner-run step O3**): terminal only, typed confirmation; the five steps of section 5.6: the control connection to `192.0.2.1:9` under the profile, the render of `seeds/templates/hyperframes/title-card` with fixed variables through `renderPicture` and the real adapter, the `/usr/bin/log show` read for the window, the output and config checks, and `trace.json`. An invisible control makes the trace invalid, never passed.
- `enable` (**owner-run step O4**) and `disable`: `enable` writes `engine.json` only when `engineState` is otherwise ready; `disable` always works.
`studio doctor` gains the same lines as `status`. All text pt-BR. The log predicate for sandbox network denials is confirmed by the control during O3; the command prints the findings (process, operation, target) to the owner and stores at most 20.

## Acceptance criteria
- [ ] `chrome install` and `trace` refuse without a terminal and without the typed confirmation; no flag supplies it (AC 69).
- [ ] `enable` writes nothing and names the reason when Chrome, the config or a covering `pass` trace is missing (AC 70).
- [ ] The trace uses exactly `buildRenderArgv` and `buildRenderEnv`; it adds no flag, key or profile of its own (AC 85).
- [ ] `trace.json` is `pass` only with: control denied and logged, exit 0, output correct, zero other network denials (AC 85).
- [ ] No command reads, lists or copies the owner's `~/.hyperframes` or `~/.cache/hyperframes` (AC 84).
- [ ] No command is called by the installer, the seed, the watcher or another command.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), on the fake process port. This ticket does not run `chrome install`, `trace` or `enable`: they are the owner's steps O2 to O4, each run by the owner after the ticket integrates, and each recorded in the change record with its output.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `npx`, no `shell: true`, no secret literal in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `tools/cli/package.json`, `scripts/**`, the PRD, SPEC 0008 or the ticket files.
- [ ] Command output and logs carry states, versions, counts and the trace findings only: no environment dump, no variable value.
- [ ] No check, build, test, install, download, render or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `tools/cli` except `tools/cli/package.json`
- dependsOn: 03-hyperframes-runtime, 05-catalog-seed-template
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; the commands it adds have external effects only when the owner runs them
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0008-hyperframes-templates.md`, `docs/vetting/0005-hyperframes-dependency.md`
