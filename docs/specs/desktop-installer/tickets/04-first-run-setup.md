# 04-first-run-setup: First-run setup and uninstall in the app

**What to build:** Opening the app for the first time walks the user through setup in a window and ends with the studio running; opening it again changes nothing; the app can remove itself.

**Blocked by:** 02

**Status:** returned degraded, inspected (2026-11-23). Open: setup window assets and the capture-browser offer file are not staged yet (packaging); `passphrase set --stdin` moved to ticket 07; ADR 0005 "no window" line moved to ticket 08.

## Requirements
- DI-AC-01
- DI-AC-02
- DI-AC-04
- DI-AC-05
- DI-AC-06

## Technical details
Plan section 5. A setup orchestrator in `apps/shell/src/setup/` with the nine idempotent steps, each a small unit with an injected process runner; a local-content setup window (no remote content, CSP as the existing menu renderer); passphrase passed to the CLI over stdin; optional downloads with host and size shown and explicit consent; watcher launchd template rendered with in-app paths; uninstall flow that keeps the data home unless separately confirmed. The shell spawns the bundled node and sets the C3 runtime variable.

## Acceptance criteria
- [ ] Second run reports every step as already done.
- [ ] A refused optional download leaves setup complete.
- [ ] Upgrade keeps data home, passphrase hash and keys.
- [ ] Uninstall removes agent, login item and app only.
- [ ] The passphrase never appears in an argument list, a log or a file.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `apps/shell/src/setup`, `apps/shell/src/electron`, `apps/watcher/launchd`
- dependsOn: 02
- Owner: frontend-coordinator
- Risk / autonomy: high / A2
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
