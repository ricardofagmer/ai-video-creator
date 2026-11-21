# 03-watcher-platform-steps: Watcher: publish step and metrics poll step (R4-03)

**What to build:** Between runs the watcher claims one publish request and uploads it, then polls due publications and drops a batch file; it refreshes tokens and records health.

**Blocked by:** 02-core-platforms (Q1 answered: the watcher uploads, between runs)

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 42
- AC 43
- AC 48
- AC 50
- AC 51
- AC 53
- AC 56
- AC 57
- AC 58 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md section 5.5, 5.7 and the watcher rows of 4.6. New folder `apps/watcher/src/platforms/`. Hook `publish.claimNext()` before `schedules.evaluate()` and `metricsPoll.run()` after it in `DaemonLoop.idleWork()`, both under `busy.track`. Use the read-only core module, the `PlatformClient` registry, `PlatformTokenVault`, `TokenLock`, the shared file helpers and the existing `CLOCK` token. Sweep `publish/` at start. Append to `runs/<runId>/publications.jsonl` through the shared helper before the first byte and at the end.

## Acceptance criteria
- [ ] No Prisma write call in `apps/watcher/**`; the watcher writes none of `gates.json`, `account.json`, `request.json`, `cancel` (AC 57).
- [ ] Before any byte: gate, account, mode, approval and artifact hash are re-checked; a failure sends nothing (AC 50).
- [ ] An attempt found `uploading` with no live claimant becomes `failed` / `watcher-interrupted`; no code path uploads one attempt twice; transport resumes are at most 3 (AC 48).
- [ ] A request past `expiresAt` or with `cancel` is closed without an upload (AC 51).
- [ ] A 429, quota, 5xx or network error ends that platform's pass with no second call and writes the stated backoff; other platforms continue (AC 56).
- [ ] After a refresh the watcher re-reads `account.json` under `token.lock` and writes nothing when disconnected or the `connectionId` changed (AC 42).
- [ ] No file under `schedules/`, `curation/`, `stages/` or `engine/` references a publish request (AC 58).

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 10-final-proof), after the owner's approval. Keep the code testable: inject the clock, the vault, the file root and the platform client.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `apps/watcher`
- dependsOn: 02-core-platforms
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
