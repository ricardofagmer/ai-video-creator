# 02-relocatable-runtime: Relocatable runtime

**What to build:** The studio (CLI, api, web, watcher) runs from any folder: it finds node, ffmpeg, ffprobe and its own built payload from one runtime locator instead of the repository path and Homebrew.

**Blocked by:** None (can start immediately)

**Status:** returned (02 + 02b), inspected by diff; residue in correction 02c

## Requirements
- DI-AC-03

## Technical details
Plan section 4 (C3 rev 2). A runtime locator in `packages/core/src/runtime/` with two modes: packaged (`ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR` set by the shell) and development (today's behaviour). Migrate every call site that resolves a node binary, `ffmpeg`, `ffprobe`, a service entry file or the web start command to it: `tools/cli/src/services/`, `tools/cli/src/doctor/`, and the ffmpeg call sites in the watcher and toolbox. The web is started from Next standalone output in packaged mode. No behaviour change in development mode.

## Acceptance criteria
- [ ] In packaged mode no resolved path is outside the runtime dir and the data home.
- [ ] In development mode every resolved path equals today's value.
- [ ] `studio doctor` reports the bundled binaries in packaged mode.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/runtime`, `tools/cli/src/services`, `tools/cli/src/doctor`, `apps/watcher/src`, `packages/toolbox/src`, `apps/web/next.config.ts`
- dependsOn: none
- Owner: backend-coordinator
- Risk / autonomy: medium / A2
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
