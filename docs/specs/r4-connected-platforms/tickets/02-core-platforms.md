# 02-core-platforms: Core: platforms module, token vault, publish and ingest handlers, mock clients (R4-02)

**What to build:** The core logic both processes share: gates, accounts, the Keychain vault, the `PlatformClient` port with three mock clients, the publish request and sync handlers, the metric batch ingest, and the insights count.

**Blocked by:** 01-frozen-contracts; the B10 owner-run check (Q5 answered: `security -i` on stdin)

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 41
- AC 45
- AC 46
- AC 47
- AC 50
- AC 54
- AC 55
- AC 59
- AC 62 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 5.2, 5.4, 5.6, 5.8, 5.10. Deliver in `packages/core/src/platforms/**`: `PlatformModes` config (fail-fast, default `mock`); `GateStore`, `AccountStore`, `HealthReader`; `PlatformTokenVault` over `/usr/bin/security` (read; stdin write through `security -i`; delete; 16 KiB bound; value never in argv, an error or a log) plus an in-memory fake; `TokenLock`; OAuth helpers (PKCE base64url and hex, `state` store port); the `PlatformClient` port, the client registry and the three mock clients with the fault scenarios; commands `SetPlatformGate`, `CompleteConnection`, `Disconnect`, `RequestPublish`, `CancelPublish`, `SyncPublishAttempts`; queries `GetPlatforms`, `GetRunPublish`; empty `clients/youtube|instagram|tiktok/` folders bound in the registry. In `secrets/**`: the six client credential names. In `metrics/**`: `IngestMetricBatch`, `origin` on views, mock exclusion. In `quality/**`: exclude `origin = mock` from baselines and `p_i`. In `insights/**`: the attempts term of `unapprovedPublications`. In `paths/**`: `DataHome.platform`.

## Acceptance criteria
- [ ] `RequestPublish` follows the nine steps of section 5.4 in order and writes nothing on a refusal (AC 45 to 47, 50).
- [ ] The module that the watcher imports registers no command handler that writes SQLite (a read-only module, as `SchedulesReadModule`).
- [ ] No token value reaches a file, a row, a log, an error or argv; the bundle type is not exported from `@studio/shared` (AC 41).
- [ ] With `origin = mock` rows present, every `qualityScore` equals its value without them; `QUALITY_SCORE_FORMULA_VERSION` is still 2 (AC 59).
- [ ] Ingesting one batch twice writes one `metric_imports` row; the file is deleted only after the commit (AC 55).
- [ ] The provider-key `KeychainWriter` and `SECRET_VALUE_PATTERN` behaviour for the two existing names is unchanged.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 10-final-proof), after the owner's approval. Keep the code testable: inject the clock, the vault, the file root and the platform client.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/platforms` (except `clients/youtube`, `clients/instagram`, `clients/tiktok` after creating them), `packages/core/src/secrets`, `packages/core/src/metrics`, `packages/core/src/quality`, `packages/core/src/insights`, `packages/core/src/paths`, `packages/core/package.json`
- dependsOn: 01-frozen-contracts
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
