# 03-payload-and-dmg: Payload staging and `.dmg`

**What to build:** One command produces a self-contained `EngineOS Video Creator.app` and a `.dmg` holding it, with its own Node, ffmpeg and built studio inside.

**Blocked by:** 02; uses findings of 00

**Status:** returned degraded, inspected (2026-11-23). ffmpeg pins superseded by ticket 10 (plan 9.2).

## Requirements
- DI-AC-20
- DI-AC-01 (build half)

## Technical details
Plan section 4. Extend `apps/shell/scripts/` to stage `Resources/runtime/` (pinned Node, ffmpeg, ffprobe, payload with production dependencies, `manifest.json` with SHA-256 per file, licences), sign every nested binary ad hoc before the bundle, keep the six fuse states of ADR 0005, verify with `codesign --verify --deep --strict`, and build the `.dmg` with `hdiutil`. Downloads are pinned by version and checksum from the sources named in vetting 0006. No Developer ID.

## Acceptance criteria
- [ ] The app bundle matches the C3 layout.
- [ ] Fuses and signature verification as ADR 0005.
- [ ] The `.dmg` contains the app and an Applications shortcut.
- [ ] Every downloaded input is checksum-verified against a pinned value.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `apps/shell/scripts`, `apps/shell/package.json`
- dependsOn: 02, 00
- Owner: devops-coordinator
- Risk / autonomy: high / A2; no download or build is run by the ticket itself
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
