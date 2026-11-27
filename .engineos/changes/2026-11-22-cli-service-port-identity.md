---
status: in-progress
risk: low
security_review: pending
branch: none (working tree on main, uncommitted)
---

# CLI: web port and renamed web process

## Why
Found while running a demo studio on ports 4320/4321 (2026-11-22):
1. `studio start` did not pass `VIDEO_STUDIO_WEB_PORT` to the web, so the web kept its default
   allowed host (port 4310) and answered 403 on any other port.
2. `studio stop web` refused to signal the web it started: Next renames its process to
   `next-server (v...)`, so the command-line identity check failed.

## What was made
- `tools/cli/src/services/service-spec.ts`: web env gets `VIDEO_STUDIO_WEB_PORT`; new optional
  `processTitlePrefix` on `ServiceSpec`, set to `next-server (v` for the web.
- `tools/cli/src/services/process-identity.ts`: `isLaunchedService` accepts the renamed title only
  when that pid listens on the recorded port (`/usr/sbin/lsof`, fixed argv, read-only).
- `tools/cli/src/services/service-manager.ts`: both identity checks (record read, SIGKILL
  re-check) use `isLaunchedService`.

- `tools/cli/src/passphrase/passphrase-hasher.ts`: `MIN_PASSPHRASE_LENGTH` 12 -> 8 (owner request,
  2026-11-22). `passphrase-set.command.ts` prompt label now reads the constant instead of a literal 12.
  The api login DTO (1..1024) and argon2id parameters are unchanged; stored hashes stay valid.

## Checklist
- [x] Code written
- [x] `pnpm --filter @studio/cli typecheck` (passed, 2026-11-22)
- [x] `pnpm --filter @studio/cli build` (passed; dist has the new code)
- [x] Demo start/stop on 4320/4321 proves both fixes: web `/login` 200 (no 403), `studio stop web`
  stopped the renamed `next-server`, api `/health` 200 and stopped. Ran outside the sandbox
  (the sandbox denies loopback connects with EPERM). Data home: `ENGINEOS_VIDEO_CREATOR_HOME`.
  Note: earlier runs used `VIDEO_STUDIO_HOME`, which the CLI ignores, so they hit the real data home.
- [x] `pnpm --filter web build` run to fix an incomplete `apps/web/.next` (no BUILD_ID) that blocked
  the web start; approved by the owner, not part of this change.
- [ ] Unit tests for `isLaunchedService` (tools/cli `__tests__` is owned by the coverage run)
- [ ] Commit on a new branch, PR

## Human decisions
- 2026-11-22, owner: "Yes, fix them" (approve the fix); checks question answered "Skip for now".
- 2026-11-22, owner: "decrease this pwd hard security pass can have 8 chars" (passphrase minimum
  12 -> 8). Weakens an auth policy: security review queued for the final gate, not run yet.
