# 06-portal-app: Portal app

**What to build:** Opening the hosted page shows the right download for this computer and, when the studio is installed, its version and health, with pairing from the app and an update notice.

**Blocked by:** 01 (contract C1 only), 00

**Status:** returned, inspected by diff; not compiled

## Requirements
- DI-AC-15
- DI-AC-16
- DI-AC-17
- DI-AC-18
- DI-AC-21

## Technical details
New static Next.js app `apps/portal` (static export, no server routes, no analytics) using `@studio/ui` tokens and the existing i18n conventions. States: checking, not installed, installed and unpaired, paired with component list, update available, loopback blocked, unknown contract. Pairing reads the one-time code from the URL fragment, exchanges it at the local api, clears the fragment, keeps the token in storage for this origin only. Polls status at most every 10 seconds while the tab is visible. Shows the SHA-256 from `latest.json`. Fallback copy follows vetting 0006.

## Acceptance criteria
- [ ] Each of the seven states renders from a typed state machine (discriminated union).
- [ ] No request other than to `127.0.0.1` and the release manifest URL.
- [ ] Responses are parsed with the C1 schemas before use.
- [ ] Works in light and dark themes; keyboard reachable; WCAG AA contrast.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `apps/portal`
- dependsOn: 01, 00
- Owner: frontend-coordinator
- Risk / autonomy: medium / A2; deployment needs the owner
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
