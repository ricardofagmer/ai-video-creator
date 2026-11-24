# 08-docs: Documentation

**What to build:** A reader of the repository learns to install from the portal, and the older documents point to what replaced them.

**Blocked by:** 03, 06

**Status:** returned degraded, inspected (2026-11-23). The README "Limits today" list must be re-read after ticket 11 integrates.

## Requirements
- R15

## Technical details
README install section (portal download first, `scripts/install.sh` as the development path, the Gatekeeper step from vetting 0006); amendment notes at PRD 0001 sections 11 and 12 and a status line in ADR 0005 pointing to ADR 0010; `apps/portal/README.md` is owned by ticket 06, not here.

## Acceptance criteria
- [ ] Every statement matches the integrated code.
- [ ] No document claims signing, notarization or Windows support.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `README.md`, `docs/prds/0001-video-studio.md`, `docs/adr/0005-packaged-shell.md`
- dependsOn: 03, 06
- Owner: docs-writer
- Risk / autonomy: low / A2
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
