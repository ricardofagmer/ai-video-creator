---
name: 2026-11-23-desktop-installer
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-23-desktop-installer.md
domain: general
security_review: pending
preview: declined
risk: high
new_feature: true
release: false
---

## What
Replace the Terminal install (`scripts/install.sh`) with a downloadable installer (macOS
first, Windows in a second phase) and add a hosted portal that detects the install and shows
its status and health by calling the local api from the browser.

## Why
The owner found the script install not good (2026-11-23) and wants a downloaded installer for
Mac and Windows with a web that knows when the studio is installed.

## Scope
Design gate so far: `docs/prds/2026-11-23-desktop-installer.md`,
`docs/adr/0010-desktop-installer-and-hosted-portal.md`, `.specs/features/desktop-installer/`,
`docs/specs/2026-11-23-desktop-installer.md`. Planned code surfaces are listed in plan section 1.

## Checklist
- [x] Owner answers on the seven design decisions
- [x] PRD, ADR 0010, plan and checks drafted
- [x] Owner review of PRD, ADR and plan (approved 2026-11-23)
- [x] Ticket granularity approved and tickets published
- [x] Prototype preview choice answered (declined, scope rev 2)
- [x] Vetting 0006 (plan rev 3 applies its corrections)
- [ ] Phase 1 tickets 01 to 08 integrated
- [ ] Final checkpoint, security review and critic pass
- [ ] Phase 2 (Windows) specified

## What was made
Design drafts only. No code.

## Not done
Everything after the design drafts.

## User checklist
- [x] Review PRD, ADR 0010 and the plan
- [x] Say whether `ricardofagmer/ai-video-creator` is public (Q1): owner says public (2026-11-23), not verified from the sandbox
- [ ] Deploy the portal to Vercel and set `ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN` to its origin (Q2: decided at deploy time, no default)
- [ ] Name the Windows machine or VM for phase 2 (Q4)

## Verification
- [validation] pending — final-stage user approval required

## Human decisions
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Web location: "Hosted web + desktop agent"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Sync scope: "Status and health (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Windows: "Mac first, Windows next (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Signing: "Unsigned for now (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Channel: "Browser to local agent (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Hosted scope: "Download + status portal (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Hosting: "Vercel + GitHub Releases (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Design review of PRD, ADR 0010 and plan rev 1: "Approve design" (permits ticket publication only)
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Ticket breakdown 00 to 08 plus final proof: "Approve breakdown"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Prototype preview, scope rev 2: "No preview, start building" (declined)
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | Repository visibility: "It is public"; portal URL: "Decide at deploy time"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | ffmpeg: "Bundle GPL build, comply (Recommended)"
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | ffmpeg source (vetting 0006 section 10): "Build in CI (Recommended)"; plan 9.2, contract C4 rev 1, ticket 10
- 2026-11-23 | Ricardo Fagmer | high-risk | approved | studio CLI in the installed app: "Show full command (Recommended)"; plan 9.4
- 2026-11-23 | Ricardo Fagmer | high-risk | deferred | Final checks (install, prisma generate, build, typecheck, lint, existing tests): "Skip for now"; validation pending
- 2026-11-23 | Ricardo Fagmer | high-risk | declined | Final security review (read-only reviewer, no scans): "Decline security review"; security_review stays pending, not verified

## Changes registered
Pending.

## Notes
Scope revision `rev1`. Amends PRD 0001 sections 11 and 12 and supersedes parts of ADR 0005
(see ADR 0010). The GitHub API could not be reached from the sandbox (TLS error), so the
repository's visibility is unverified.
