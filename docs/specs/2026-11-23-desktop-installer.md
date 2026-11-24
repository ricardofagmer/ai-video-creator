---
status: approved
date: 2026-11-23
---

# Desktop installer and hosted portal: spec index

Status: plan rev 3, frozen. Design gate passed (owner, 2026-11-23); ticket breakdown approved and published. Planning open
(phase 2, Windows, is specified after phase 1 integrates).

## Request

"this approach to install in my computer via sh files is not good, so create a approach to
download an installer to make this work: for mac, for windows. the web app must be aware when
it installed and synch with my computer" (owner, 2026-11-23).

## Artifacts

| Artifact | Path | State |
|---|---|---|
| PRD | `docs/prds/2026-11-23-desktop-installer.md` | accepted |
| ADR | `docs/adr/0010-desktop-installer-and-hosted-portal.md` | accepted |
| Plan (contracts C1 to C3, acceptance DI-AC-01 to 22) | `.specs/features/desktop-installer/plan.md` | rev 3 frozen |
| Proposed final evidence | `.specs/features/desktop-installer/checks.md` | rev 1 draft |
| Tickets | `docs/specs/desktop-installer/tickets/` | published 2026-11-23: 00 to 08 and 09-final-proof; graph in `docs/specs/desktop-installer/units.json` |
| Change record | `.engineos/changes/2026-11-23-desktop-installer.md` | active |

## Decisions already taken by the owner (2026-11-23)

Hosted web plus desktop agent; sync covers status and health; Mac first, Windows next;
unsigned for now; browser to local agent; hosted scope is a download and status portal;
Vercel plus GitHub Releases.

## Open before implementation

Answered 2026-11-23: Q1 (repository is public, owner's word), Q2 (portal origin set at deploy
time), Q3 (vetting 0006), ffmpeg (bundle the GPL build and comply), preview (declined), ticket
granularity (approved). Still open: Q4 (Windows test machine, phase 2).
