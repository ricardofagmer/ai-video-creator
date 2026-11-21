# R4 inspection evidence (no tests)

Date: 2026-11-20. Branch `feat/r4-connected-platforms`, working tree after the wave 4 review fixes
(uncommitted). The owner asked to continue without tests, so this covers only the inspection rows
of SPEC 0007 section 12. Everything below was found by read-only `grep` and file reads. No test,
app run, network call or migration was executed. Typecheck, lint and build were green at this
revision.

## Result per acceptance criterion

| AC | State | Evidence or what is missing |
|---|---|---|
| 39, 40, 42, 43, 45, 47, 50, 51, 53 to 56, 59 | needs test | Behaviour checks (PKCE and `state`, callback refusals, disconnect race, revoked token, 409 and idempotency, artifact hash, expiry, `pollDue`, score equality, batch ingest, fault backoff, mock with network off). No inspection evidence applies |
| 41 | partial | Token values are revealed (`revealForPlatformCall`) only in `packages/core/src/platforms/clients/**`, `vault/keychain-token-vault.ts`, `oauth/pkce.ts` and `token-bundle.ts`. The vault write runs `security -i` with the value on stdin (`keychain-token-vault.ts:183`, `stdio: ['pipe', 'ignore', 'ignore']`). Read and delete pass only service and account names in argv (`:144-166`). Missing: the sentinel search over the data home, SQLite, logs and responses |
| 44, 46, 49, 62 | needs test and browser walk | Gate behaviour, biometric dialog, publication listing, 401 on every rev 7 route and `unapprovedPublications` |
| 48 | partial | Only the watcher appends to `publications.jsonl` (`appendRunPublicationLine`, called only from `apps/watcher/src/platforms/publish-attempt.files.ts:121`). Missing: the restart-during-upload test |
| 52 | pass by inspection | No `fetch`, client call or upload in `apps/api/src/publishing/**`. `POST /runs/:id/publish/:p` carries `@HttpCode(202)` (`publishing.controller.ts:61-62`). Outside the clients folder, network client methods are called only by `start-connection`, `complete-connection` and `disconnect` handlers in core, and by the watcher. `PublicationLinker` calls `publicationUrl`, which builds a string. Other server-side `fetch(` calls are R1 to R3 code (ElevenLabs client, browser route handler, CLI loopback probe) |
| 57 | pass by inspection | The watcher's Prisma use is read-only: `publicationAttempt.findMany`, `publicationAttempt.findUnique`, `runOutcome.findUnique`, `runPublication.findMany`. Writers by app: `writeGatesFile`, `writeAccountFile`, `createPublishRequest` and `createCancelMarker` are called only by core command handlers (set-platform-gate, complete-connection and disconnect, request-publish, cancel-publish), and the watcher imports none of them. `writeHealthFile`, `writePollCursor`, `writePublishState`, `claimPublishAttempt`, `createMetricBatch` and the `publications.jsonl` append are called only from `apps/watcher`; the api, CLI, web and core do not call them |
| 58 | partial | `createPublishRequest` is called only by `request-publish.handler.ts`. No file under any `schedules`, `curation`, `stages` or `engine` folder references `request.json`, `RequestPublish` or the publish files. Missing: the scheduled run reaching `review` with no attempt |
| 60 | pass by inspection, grep-based | Every `events.record` and `logger.*` call in the watcher platform step, api `connections` and `publishing`, core `platforms` and CLI `platforms` carries ids, platform, capability, attempt state, reason or failure ids. None carries a token, code, OAuth `state`, verifier, URL, title, caption, tag or account label. No `console.*` in those folders. No token is set as a URL query parameter in `packages/core/src/platforms` (K3). Missing: the sentinel run that confirms it at runtime |
| 61 | pass by inspection | `20261120120000_r4_connected_platforms`: 1 CREATE TABLE, 1 CREATE INDEX, 2 CREATE UNIQUE INDEX, 4 ADD COLUMN (3 on `run_publications`, 1 on `metric_imports`). `20261120180000_r4_publish_metadata_hash`: 1 ADD COLUMN on `publication_attempts`. No DROP, UPDATE, INSERT or table rebuild. Neither has been executed |
| 63 | pending (owner) | Not run for YouTube, Instagram or TikTok |

Also checked: no `.only` (or `{ only: true }`) in any test file.

## Drift found

SPEC 0007 section 16 says the migration "adds one table, three indexes and four columns". The
review-fix migration `20261120180000_r4_publish_metadata_hash` adds a fifth column
(`publication_attempts.metadata_sha256`). It is recorded in `review-fixes.md` but not in the SPEC.
Fixed 2026-11-20: section 16 now names both migrations and the fifth column.

## Not covered here

The unit and integration tests, the mock-mode browser walk, the `security-reviewer` and `critic`
passes of the final gate, and the owner's AC 63 runs. Ticket 10 stays open.
