# 00-vetting: Vetting 0006: installer and portal facts

**What to build:** Every statement marked Unverified in ADR 0010 and the PRD is confirmed or corrected against vendor documentation, so tickets 03, 04 and 06 build on facts.

**Blocked by:** None (can start immediately)

**Status:** done (2026-11-23)

## Requirements
- Q3

## Technical details
`docs/vetting/0006-installer-and-portal.md` covering, each with source URL and access date: (1) Chrome, Edge, Firefox and Safari rules for an HTTPS page calling `http://127.0.0.1` (local network access permission, preflight headers, mixed content); (2) macOS Gatekeeper behaviour for an ad hoc signed app from a downloaded `.dmg` on current macOS, and the exact user steps; (3) the Node binary to bundle: official source, version pin, checksum procedure; (4) a static arm64 `ffmpeg`/`ffprobe` build: source, licence (LGPL or GPL) and redistribution duties; (5) Next.js standalone output and Prisma engine, `onnxruntime-node`, `@node-rs/argon2` relocation notes; (6) measured or estimated bundle size. End with a "corrections to ADR 0010" list. Read-only research; adds no dependency.

## Acceptance criteria
- [ ] Each of the six topics has a finding, a source and a date, or is marked "could not verify" with the reason.
- [ ] Corrections that contradict a frozen contract are listed for the supervisor, not applied.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `docs/vetting/0006-installer-and-portal.md`
- dependsOn: none
- Owner: general-purpose
- Risk / autonomy: medium / A1 (research and one document)
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
