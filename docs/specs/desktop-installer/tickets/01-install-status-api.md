# 01-install-status-api: Install-status contract and api module

**What to build:** A browser page on the configured portal origin can ask the local api whether the studio is installed, pair with a one-time code and read component health; every other origin and every other route behave as today.

**Blocked by:** None (can start immediately)

**Status:** returned (01 + 01b), inspected by diff; not compiled

## Requirements
- DI-AC-07
- DI-AC-08
- DI-AC-09
- DI-AC-10
- DI-AC-11
- DI-AC-12
- DI-AC-13
- DI-AC-14

## Technical details
Plan sections 2 and 4. Contract C1 in `packages/shared/src/api/install.ts` (strict Zod schemas, route segments added to `routes.ts`, exported from the api index). Nest `InstallModule` in `apps/api/src/install/`: presence (public), pair, status (bearer token guard), a scoped CORS and `Host` check applied to `/install/*` only, pair-code and token services with injected clock and random source, throttling modelled on `auth/login-throttle.ts`. Additive Prisma migration for hashed tokens and pending pair codes (authoring only; never executed by this ticket). `ApiConfig` reads `ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN` and validates it. Component probes live in `apps/api/src/install/probes/` and read binaries through the runtime variable of C3 rev 2 (unset means development: resolve from PATH). A CLI-facing use case issues a pair code and revokes tokens (called by ticket 07).

## Acceptance criteria
- [ ] Presence returns exactly the five C1 fields.
- [ ] No CORS allow header for another origin or for a non-install route; no credentials header ever.
- [ ] Forged `Host` answers 421; missing or wrong token answers 401 with no body fields.
- [ ] Pair code is single use, expires after 5 minutes, locks after 5 failures; token stored only as SHA-256 and compared in constant time.
- [ ] Status payload carries no path, user name, port or secret in any state.
- [ ] `main.ts` still binds `127.0.0.1` and keeps its listener assertion.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 09-final-proof), after the owner's approval. Keep the code testable: pure functions, injected clock, injected file root and injected process runner.

## Definition of Done
- [ ] No `any`, no silencing `as` cast, no secret literal, no placeholder data in the changed files.
- [ ] No edit outside the exclusive paths; no edit to the PRD, ADR 0010, the plan or the ticket files.
- [ ] No check, build, test, install, download, release, deploy or git write was run by this ticket; review evidence is by inspection.

## EngineOS brief metadata
- Exclusive paths: `packages/shared/src/api/install.ts`, `packages/shared/src/api/routes.ts`, `packages/shared/src/api/index.ts`, `apps/api/src/install`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/platform/api-config.ts`, `packages/core/prisma`
- dependsOn: none
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no migration execution
- Contracts: `.specs/features/desktop-installer/plan.md` rev 3 (C1 rev 2, C2 rev 2, C3 rev 3; section 9 wins over earlier sections), `docs/adr/0010-desktop-installer-and-hosted-portal.md`, `docs/prds/2026-11-23-desktop-installer.md`
- Read-only integration evidence: scoped diff inspection against the exclusive paths and the named contract sections
