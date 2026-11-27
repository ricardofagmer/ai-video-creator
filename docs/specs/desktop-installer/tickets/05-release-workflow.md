# 05-release-workflow: Release workflow

**What to build:** Pushing a version tag publishes the installer, its checksum and `latest.json` to a GitHub release.

**Blocked by:** 03

**Status:** returned degraded, inspected (2026-11-23). The upload-artifact, download-artifact and cache pins were checked against their tags on the GitHub API on 2026-11-23 and match. Open: first dry run, owner-side `release` environment and tag ruleset.

## Requirements
- DI-AC-19

## Technical details
Plan section 3 (C2). `.github/workflows/release.yml` on `v*` tags and `workflow_dispatch` (dry run): pinned action SHAs as in `ci.yml`, job-scoped `contents: write`, no secrets beyond the workflow token, builds on macOS arm64, writes `latest.json` and `.sha256`. A small script under `scripts/release/` renders the manifest. The workflow is authored, never triggered, by this ticket.

## Acceptance criteria
- [ ] Permissions are least privilege and scoped to the publishing job.
- [ ] `latest.json` validates against C2.
- [ ] A dry run uploads nothing.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `.github/workflows/release.yml`, `scripts/release`
- dependsOn: 03
- Owner: devops-coordinator
- Risk / autonomy: high / A2; triggering a release needs the owner
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
