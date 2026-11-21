# 10-cli-trace-rev2: CLI: trace on the rev 2 contract (R4H-10)

**What to build:** `studio hyperframes trace` runs its controls and its render under the seventeen-parameter sandbox, probes four of the new denials, verifies the Chrome binary before it starts anything and records the hash of the binary it actually ran (M1, L1).

**Blocked by:** 08-runtime-sandbox-hardening

**Status:** integrated (2026-11-21, OK; not compiled yet)

## Requirements
- AC 92
- AC 93 (SPEC 0008 section 17.13; findings M1 and L1 of section 17.1). The owner-run AC 98 is observed with this command and is not done by this ticket.

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 17.5, 17.6, 17.9 and B12. Files this touches: `tools/cli/src/hyperframes/cli-runtime.ts` (the nine new runtime fields: ports from `CliSettings.ports`, the owner's home from `CliSettings.homeDirectory`, the studio root, the data home, `ffmpeg` and `ffprobe` resolved by name on the child PATH, every path a real path), `tools/cli/src/hyperframes/network-trace.ts` (controls C1 to C5 built with `buildSandboxArgs`, no index into the render argv; informational findings; the two hashes), `tools/cli/src/commands/hyperframes-trace.command.ts` (`verifyChromeBinary` before the confirmation's work starts; no `chrome.sha256` passed into the record), `tools/cli/src/hyperframes/sandbox-log.ts` only if a denial kind needs a helper, and the pt-BR texts for the new findings.

Control rule (frozen in section 17.9): each control is one `node -e` under the render's own sandbox arguments and exits 0 only on `EPERM` or `EACCES`. C2 starts `/usr/bin/true`; C3 creates a random-named file directly under `HF_ROOT` with an exclusive create, and the trace removes and reports it if it exists afterwards; C4 lists `DATA_HOME`; C5 connects to `127.0.0.1:<apiPort>`. No control touches `~/.ssh`, a Keychain, an `.env` file, a daemon socket or a mach service.

`HyperframesTraceFileSchema` does not change (K18): the new conditions reach `result` and `findings`; `controlDenied` keeps its rev 1 meaning.

## Acceptance criteria
- [ ] With a binary that fails `verifyChromeBinary`, the command starts no process and writes no `trace.json`; the refusal uses the `chrome-missing` text (AC 92).
- [ ] The record's `chromeSha256` is the hash computed from the binary after the render; a hash that differs from `chrome.json` before or after the render gives `fail` with a finding (AC 92).
- [ ] C1 to C5 and the render start with deep-equal `-f` and `-D` arguments from `buildSandboxArgs` (AC 93).
- [ ] `pass` needs the rev 1 conditions and C2 to C5 refused; a control that is not refused gives `fail` and a finding naming it; a file left by C3 is removed and reported (AC 93).
- [ ] Non-network denials not caused by a control are shown as informational findings and do not change the result; the 20-finding and 200-character bounds still hold (AC 93).

## Testing requirements
None in this ticket, and none in this wave (SPEC 0008 K17, owner decision OD8). Do not add or edit a test file; existing CLI tests that the new runtime fields or the control arguments break are updated by ticket 12. This ticket runs no trace: the trace is the owner's step O3.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `shell: true`, no `process.env` spread, no secret literal in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `tools/cli/package.json`, to a test file, to `packages/**`, to `apps/**`, to SPEC 0008 or to a ticket file.
- [ ] `chrome install`, `enable`, `disable`, `status` and `doctor` have no behaviour change.
- [ ] Events still carry counts and states only (`hyperframes.trace-finished` fields unchanged).
- [ ] No check, build, test, install, download, render, trace or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `tools/cli` except `package.json` and `**/*.test.ts`
- dependsOn: 08-runtime-sandbox-hardening
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` section 17 (rev 2, once frozen); the `@studio/hyperframes` API delivered by 08
