# 07-shell-runtime-vetting: Vetting report for the Electron menu-bar shell (R3-08 part 1)

**What to build:** The dependency vetting report R3-08 requires before any manifest or lockfile change for the packaged shell (ADR 0005, owner answer Q1: Electron menu-bar).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Requirements
- R3-AC-25 (SPEC 0006 section 8; PRD 0001 AC 37 and 38 through SPEC 0006 section 11)

## Technical details
docs/specs/0006-r3-outside-signals-and-packaging.md section 9 R3-08; ADR 0005; format of `docs/vetting/0001-embedding-runtime.md`. Read-only `npm view` registry lookups only (network read, no install, no pack, no download, no tarball opened). Cover identity and publisher, version and release date, licence, lifecycle scripts, native binaries and their download hosts, footprint, the `onlyBuiltDependencies` entry needed, known advisories, and the remote switches to turn off (auto-update, crash reporter, remote content). Status line: **awaiting owner decision**. The shell code itself is not part of this run: it waits for the owner's approval of this report.

## Acceptance criteria
- [ ] `docs/vetting/0002-shell-runtime.md` exists with every section above, each value marked Registry or Unverified.
- [ ] The report names the exact package versions proposed and every lifecycle script in their tree.
- [ ] Nothing was installed and no manifest or lockfile changed (git status evidence).

## Testing requirements
Documentation only; review-only ticket.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md` or ADR 0003.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).

## EngineOS brief metadata
- Exclusive paths: `docs/vetting/0002-shell-runtime.md`
- dependsOn: none
- Owner: backend-coordinator
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`
