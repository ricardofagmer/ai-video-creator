# 07-shell-portal-link: Shell portal link

**What to build:** The app's menu connects this computer to the portal with one click, shows when an update exists, and can revoke the connection.

**Blocked by:** 01, 04

**Status:** returned degraded, inspected (2026-11-23). The CLI search-module tidy-up was finished by the supervisor. Open: the packaged app cannot read the portal address and manifest address from the environment when started from Finder; packaging must supply them.

## Requirements
- DI-AC-11 (issuing side)
- DI-AC-17 (menu half)

## Technical details
Menu items "Connect to portal", "Disconnect portal" and an update line, following the existing menu model and labels. Connect asks the CLI for a pair code and opens the portal URL with the code in the fragment through the system browser. The update check reads `latest.json` only when the user opens the menu, never in the background.

## Acceptance criteria
- [ ] The code is never written to a log or a file.
- [ ] No network request happens without a user action.
- [ ] Menu model stays a pure function of state.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `apps/shell/src/menu`, `apps/shell/src/portal`, `tools/cli/src/commands`
- dependsOn: 01, 04
- Owner: frontend-coordinator
- Risk / autonomy: medium / A2
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
