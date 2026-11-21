# R4 review fixes (SPEC 0007 rev 2, run 2026-11-20-r4-connected-platforms)

Status: approved by the owner ("Yes, fix them here", 2026-11-20). Risk: high (token and Keychain
handling). Source of the findings: the run's security review (S1 to S5) and critic pass (C1 to
C11), recorded in `.engineos/changes/2026-11-20-r4-implementation.md`.

## Decisions taken without a question (owner may overturn)

- **C11 spec conflict:** the code follows section 5.3. Section 5.2 now says the same thing.
- **S5:** cap the bundle instead of probing the real Keychain. A token text is at most 1,024
  characters, and the vault refuses, before spawning `security`, any command line longer than
  3,800 bytes (`security -i` reads lines into a 4 KiB buffer). No Keychain call is made to check.
- **C9:** both sides. Core refuses a reused key whose body differs; web makes a new key on edit.
- **ACL `-T /usr/bin/security`:** accepting it as a risk in ADR 0007 is the owner's call. It is
  not part of these fixes.
- **watcher.pid:** keeps its format. The publish claim gets the boot-time and same-user liveness
  rule (C1). The token lock gets the same-user rule only: it already turns stale 60 s after its
  mtime, so a lock from an earlier boot is always stale. `watcher.pid` readers are R1 surface and
  out of scope.
- **`command-too-long`:** the bundle limit keeps every write line under 3,800 bytes, so the vault's
  line check cannot fire today. It stays as a second guard in case the bundle limit changes.

## Frozen contracts (wave 1, supervisor)

| Contract | File | Change |
|---|---|---|
| Process identity | `packages/shared/src/run-files/process-identity.ts` (new) | `currentBootTimeMs`, `isSameBoot`, `isOwnProcessAlive` (EPERM is dead), `formatProcessStamp`, `parseProcessStamp`, `isStampAlive` |
| Publish claim | `packages/shared/src/platforms/files/publish-files.ts` | claim holds `<pid> <bootTimeMs>`; `readPublishClaim` returns `stamp`; `isPublishClaimantAlive(stamp, selfPid)` |
| Token lock | `packages/shared/src/platforms/files/token-lock.ts`, `constants.ts` | `holdsTokenLock`; `tokenLockBounds.operationBudgetMs` 40,000 |
| Client port | `packages/core/src/platforms/clients/platform-client.port.ts` | `UploadRequest.file: FileHandle` and `sha256` replace `filePath`; `MetricsRequest.signal: AbortSignal` |

## Tickets (wave 2, parallel, exclusive paths)

### F1 core (`packages/core/src/**`, except the port file)

- **S1** Disconnect always deletes the Keychain item, whatever `account.mode`, after writing
  `disconnected` first (C5). A mock connect deletes an earlier live item. When the vault write
  succeeds and the account write fails, delete the item again. Revoke at disconnect runs when a
  live bundle exists. Every call under `token.lock` is bounded by `operationBudgetMs`, and every
  vault write under it is preceded by `holdsTokenLock`.
- **S4** Each revealed token is registered with the value redactor before use.
- **S5** `MAX` token text 1,024; the Keychain vault refuses a write line over 3,800 bytes with a
  typed error and spawns nothing.
- **S2, C7 (core side)** Mock clients read through `UploadRequest.file` and honour
  `MetricsRequest.signal`.
- **C4 (core side)** Sync reconciles a terminal row whose `state.json` shows an upload (claim
  present and `uploading` or later), so the publication is linked and step 7 blocks a duplicate.
- **C8** `insights.repository.ts` exclusion list adds `token-revoked`, `internal-error` and
  `watcher-interrupted` written before any byte.
- **C9 (core side)** A reused idempotency key whose run, platform, metadata or visibility differ
  answers 409 `publish-idempotency-key-reused` and writes nothing.

### F2 watcher (`apps/watcher/src/**`)

- **C1** Claim liveness through `isPublishClaimantAlive`.
- **C2** Processing gives up by check count only, and only after at least one status query; the
  inbox window also needs one query before it closes.
- **S2 (watcher side)** Open `final.mp4` once with O_NOFOLLOW, fstat, hash from the handle, pass
  the handle and hash in `UploadRequest`, close it after.
- **S3** `PublishRecheck` matches `request.json` against the `publication_attempts` row (state
  `queued`, same run, platform, connection, artifact hash and metadata) before any upload.
- **C5 (watcher side)** `holdsTokenLock` before each `vault.write`; refresh bounded by
  `operationBudgetMs`.
- **C7** Pass the abort signal of `pollRules.passBudgetMs` to `fetchMetrics`.
- **C10** Blocked connections come from `health.json` (`needs-reconnect` for the connection id),
  not only from memory.
- **C11** TikTok inbox draft later published appends a `published` line; mock polls never mark a
  manual publication polled; production wiring has no `@Optional()` no-op platform steps.

### F3 web and api (`apps/web/src/**`, `apps/api/src/**`; the error id in `packages/shared/src/api/common.ts` is frozen in wave 1)

- **C6** pt-BR texts: the remove-app-access hint after disconnect (5.2), "Na fila: o watcher está
  ocupado com outra execução" (5.5), and "o estúdio não consegue desfazer uma publicação" in the
  publish dialog (16).
- **C9 (web and api side)** A new idempotency key whenever the form changes; error id
  `publish-idempotency-key-reused`, 409, with a pt-BR message, mapped by the api.

### F4 final proof (final gate only, after consent)

- **C3** The AC 54 test ingests through `IngestMetricBatch`; the AC 59 test uses an existing
  manual publication. Regression tests for each fix above.

## Done when

- Every finding is fixed in code or marked with its reason, and each ticket's worker returns its
  changed files.
- Typecheck, lint, tests and build pass at the final revision, after the owner consents to them.
- The security reviewer and critic reruns on the fix diff find no open medium or major finding.

## Round 2 (after the gate's reviews, owner decision 2026-11-20)

Frozen contract (supervisor): `publishMetadataSha256(metadata)` in
`packages/shared/src/platforms/files/publish-files.ts` (Node-only module; the web never imports it).
Column `publication_attempts.metadata_sha256`, Prisma `metadataSha256 String? @map("metadata_sha256")`,
added by a new additive migration; null means "not comparable" and the watcher refuses to upload.

| Ticket | Owner, paths | Findings |
|---|---|---|
| G1 | dba-coordinator: `packages/core/prisma/schema.prisma`, new `packages/core/prisma/migrations/20261120180000_r4_publish_metadata_hash/` | F-3 schema |
| G2 | backend-coordinator: `packages/core/src/**` and its tests | F-1, F-2, R2 (step 7 side), R3, R4, F-3 write |
| G3 | backend-coordinator: `apps/watcher/src/**` and its tests | R1, R2 (recheck side), R5, R7, F-3 compare |

Left as nits: R6 (exact "watcher busy" text needs a shared busy flag), R8 (`performance.now` stops
during sleep while lock staleness uses the wall clock).

G1 is done by the supervisor as part of the contract freeze (schema column and migration
`20261120180000_r4_publish_metadata_hash`, authored, not executed).

### Round 2 findings (what each fix must do)

- **F-1** (`packages/core/src/platforms/commands/complete-connection.handler.ts` about 105-114): a
  vault write that throws after the item landed leaves an orphan token. Give the write a
  `reserveMs` so a cleanup delete still fits in the lease budget, and on any write failure, when no
  connected account existed before, delete the item best-effort (a delete failure is logged by id
  only and does not replace the original error).
- **F-2** (`packages/shared/src/platforms/files/token-lock.ts` 84-91 and the core Keychain vault
  172-175): the lock can be released while a killed `security` child is still running. The vault's
  `runInteractive` waits for the child's exit after the kill (bounded, a few hundred ms), and
  `bounded` waits for the wrapped call to settle after its timeout before the lease ends.
  Shared `token-lock.ts` belongs to G2.
- **F-3 write** (core): `RequestPublish` and the repository's `insertQueued` store
  `publishMetadataSha256(request.metadata)` in `metadataSha256`. A reused idempotency key compares
  the stored hash as part of the "same body" check.
- **F-3 compare** (watcher `publication-attempt.reader.ts`, `attemptRowMismatch`): mismatch when the
  row hash is null or differs from `publishMetadataSha256(requestFile.metadata)`. Fix the comment at
  about line 61 so it states what is compared.
- **R1 major** (`apps/watcher/src/platforms/publish-follow-up.ts` 78, 102, 107-110): after the
  follow-up deadline a failing token acquire retries every 1 s for ever, and a `processing` attempt
  is followed for ever. A failed acquire after the deadline counts as a check (or backs off to the
  normal check interval with a cap), so the attempt reaches its terminal give-up.
- **R2 minor** (core step 7 of `request-publish` and watcher recheck): in the C4 deferred case a
  duplicate can start. Refuse a new attempt, and refuse the upload at recheck, while a withdrawn or
  terminal attempt of the same run and platform has a claim and a `state.json` that shows an
  upload. Existing test `packages/core/src/platforms/commands/sync-publish-attempts.test.ts`
  220-232 must change to the new behaviour.
- **R3 minor** (`packages/core/src/platforms/commands/sync-publish-attempts.handler.ts` 34-36):
  `showsUpload('failed')` is true for an attempt that failed before any byte. Also require an
  `upload-started` line in the attempt's publish log (or bytesSent > 0) before treating `failed` as
  an upload.
- **R4 minor** (`packages/core/src/platforms/publish/publish-request-match.ts` 60, 64): drop the
  connection id from the compare; a missing `request.json` means "not comparable" (no 409, no
  match); a corrupt `request.json` must not throw out of the handler (treat as not comparable).
- **R5 minor** (`apps/watcher/src/platforms/metrics-poll.step.ts` 148-158): race `fetchMetrics`
  against the pass abort signal inside the step, so a client that ignores the signal cannot hold
  the pass past its budget.
- **R7 nit, fixed** (`apps/watcher/src/platforms/platform-health.writer.ts` 74): a corrupt
  `health.json` is read as "no blocked connections" (fail-open). Treat it as unknown: block
  publishing for that platform until a good health file is written, and log the parse failure.

## Round 3 (owner decision 2026-11-20: fix the four round 2 minors)

Frozen decisions (supervisor):
- **R7 recovery stays in the watcher** (AC 57: the api and CLI never write `health.json`). On a corrupt
  `health.json` the watcher blocks that platform for the current tick (`health-unknown`, as now),
  then moves the file aside with an atomic rename to `health.json.corrupt` (replacing an older one),
  logs `platform.health-unreadable` once (platform and error class only), and from the next tick
  reads the platform as having no health file. A block that still applies comes back from the next
  token call (refresh refused gives `needs-reconnect` again). The three comments that say a write
  ends the block are corrected.
- **R1:** past `followUntil` only a real acquisition failure (refresh or vault failure) counts as the
  window's query. Transient waits (`lock-held`, `health-unknown`) do not, but they still count
  toward `MAX_TOKEN_WAITS`, so every attempt still ends.
- **R4:** a replayed idempotency key whose stored row cannot be compared (null hash and `request.json`
  missing or corrupt), whatever the row's state, answers 409 `publish-idempotency-key-reused`
  (the key cannot be proven to carry the same body) and writes nothing. When the handler's step
  order allows, this answer comes before the final video is hashed.
- **F-1 (replace case):** when the vault write fails while a live connection existed, read the item
  back inside the write's reserve; if it decodes to the new `connectionId`, delete it (the old
  bundle was already overwritten, so the watcher then sees no item and reports needs-reconnect).
  A failed read-back or delete is logged by failure id only; the original error is still thrown.
  The test asserts which bundle remains, and its message is corrected.

| Ticket | Owner, paths | Items |
|---|---|---|
| G4 | backend-coordinator: `packages/core/src/**` and tests | R4, F-1 replace case, core-side R2 tests (corrupt `state.json`, expired row, processing and sent-to-inbox, claimed row with a cancelled file, window edge) |
| G5 | backend-coordinator: `apps/watcher/src/**` and tests | R7 recovery and comments, R1 transient waits |

## Round 4 (owner decision 2026-11-20: fix critic round 3 minors A and B)

Frozen contract (supervisor, done): `ReconnectReasonSchema` gains `token-missing` (shared `enums.ts`,
SPEC 0007 section 3 table), pt-BR label "A autorização guardada no Keychain não foi encontrada." in
the web and CLI label maps.

- **A:** when the watcher's token session finds no Keychain item for a connection that
  `account.json` shows as connected in a mode that keeps its bundle in the vault, it writes
  `health.json` `needs-reconnect` with `token-missing` for that connection (same path as the other
  reconnect reasons, so `/contas` and `studio status` show "Reconecte a conta" and api step 3
  refuses). A reconnect clears it as it clears the others. The F-1 comment in
  `complete-connection.handler.ts`, its test message, and the round 3 line above that says the
  watcher "reports needs-reconnect" become true once this lands; check their wording.
- **B:** `PublishRecheck.checkAccount` calls the health writer's `recoverUnreadable` when the
  corrupt file is `health.json`, so the publish path heals in the same tick as the token and
  metrics paths. The metrics step reads health before its `lastPassMs` throttle, or otherwise
  recovers a corrupt file without waiting for the next pass.
- **Nit:** a chmod failure after a successful rename is not logged as
  `platform.health-set-aside-failed`; it leaves the mode as it is and logs nothing or a distinct
  event.

| Ticket | Owner, paths | Items |
|---|---|---|
| G6 | backend-coordinator: `apps/watcher/src/**` and tests; `packages/core/src/platforms/commands/complete-connection.handler.ts` and `complete-connection.test.ts` (comment and message only) | A, B, nit |
