# 0007. Connect platforms with loopback OAuth, keep tokens in a Keychain vault, and make the watcher the only platform caller after connect

Date: 2026-11-20
Status: accepted (owner, 2026-11-21). The owner answered SPEC 0007 Q1 to Q5 on 2026-11-20 (OD5
to OD9): option (a) for Q1, Q2, Q3 and Q5, option (b) for Q4.

Decider: Ricardo Fagmer. Sources: PRD 0001 (`docs/prds/0001-video-studio.md`) section 3 R4
goals 1 to 3, section 12, AC 37 and 38; SPEC 0007 (`docs/specs/0007-r4-connected-platforms.md`,
frozen rev 2) sections 3, 4, 5.1 to 5.8, 13, 14 and 15; ADR 0003 ("Who writes what"); SPEC 0006
(the metrics import, the snapshot store, K1, K6, K8); `docs/RUN-FORMAT.md` sections 25 and 26.
Platform facts are readings of public developer pages accessed 2026-11-19 (SPEC 0007 section 5.1)
and can change without notice; claims no official page confirmed are marked **Unverified** there
(U1 to U8).

## Context

Until R4 nothing in the studio calls a platform: metrics arrive by CSV or the form (SPEC 0006 OD2),
a publication is a URL the owner pastes, and the Keychain holds only two provider keys written from
a terminal prompt. R4 asks for three things (PRD R4 goals 1 to 3): metrics pulled from the YouTube,
Instagram and TikTok APIs and recorded like the R3 import; assisted publishing of an approved run
with one click and no silent retry; and OAuth-connected accounts whose tokens live in the Keychain
and are deleted on disconnect.

Forces:

- One owner, one Mac, loopback only. The web and the api bind to `127.0.0.1`; every route needs the
  passphrase session (D8). No relay server, tunnel, hosted callback or public video URL (PRD 12).
- Token values may exist only in the Keychain item and process memory (SPEC 0007 K3): never in a
  file, SQLite, a run file, a prompt, a log, an event, an error, a URL the studio builds, argv or an
  environment variable the studio sets.
- The watcher never writes SQLite (ADR 0003, SPEC 0006 K1); no file has two writers (K2), with
  stated exceptions.
- An upload happens at most once per request (K5); no publishing without a recorded approval and
  an explicit owner click (K4); no scheduled or unattended publishing.
- No new runtime dependency (K9): HTTP is Node's `fetch`, PKCE is `node:crypto`.
- The migration may only create tables and indexes and add columns (K8); the snapshot table's
  `CHECK ("source" IN ('csv', 'form'))` cannot be redefined.
- Each platform ships on its own and may wait on its platform's review (OD2).

## Decision

1. **OAuth on loopback.** Authorization code with a single-use `state` bound to the session (32
   random bytes, 10 minutes, at most 5 pending, api memory only) and PKCE S256 where the platform
   offers it (hex challenge for TikTok, base64url otherwise). The redirect URI is exactly
   `http://127.0.0.1:<api port>/platforms/<platform>/connection/callback`
   (`connectionRedirectUri`, default port 4311, B3). The callback keeps the session guard: the
   `SameSite=Lax` cookie is sent on the top-level GET (L6). It answers 303 to
   `/contas?resultado=...` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and
   stores nothing on the first failure. Scopes are requested only for capabilities whose gate is
   `enabled`, and are checked after the exchange. Instagram's loopback acceptance is **Unverified**
   (U3); its ranked fallback (a logic-free 307 from `localhost`, then paste-back) is SPEC 0007
   section 5.2.
2. **A Keychain token vault.** One generic-password item per platform in the service
   `com.videostudio.platform-tokens`, account = the platform name, password = base64url of the
   JSON token bundle (at most 16 KiB). The write is `add-generic-password -U ...` sent as one
   command line on the **stdin** of `/usr/bin/security -i`, never in argv (OD9, Q5 a; checked by
   the owner-run B10 on 2026-11-20). Every write and delete holds `token.lock`. In memory the
   tokens are wrapped in `Secret`, so the existing redactor covers logs and errors. The six OAuth
   client credentials come from the environment, then the existing provider-key service; a missing
   one is the status `not-configured`, never a literal or a default.
3. **The watcher is the only platform caller after connect.** The api calls a platform only to
   exchange the code and fetch the identity at connect, and for one best-effort revoke at
   disconnect. After connect, the watcher alone reads and refreshes the tokens, so a rotating
   refresh token (TikTok) has one user and cannot be spent twice. Publishing: the api records the
   owner's click (`RequestPublish`: the `publication_attempts` row and `request.json`) and answers
   202; the watcher uploads between runs (OD5, Q1 a), then records `state.json` and
   `publications.jsonl`; the api copies the result into SQLite (`PublishAttemptSync`).
4. **Pulled metrics enter through the R3 import (OD7, Q3 a).** The watcher writes a batch file to
   `platform/metrics-inbox/`; `IngestMetricBatch` in the api or CLI ingests it as a `metric_imports`
   row with `origin = 'api'` and upserts snapshots with source `csv`, so "in force", the duplicate
   rule and the score formula stay exactly as SPEC 0006 defines them.
5. **Instagram is metrics-only in R4 (OD8, Q4 b).** Instagram Login, no Facebook Page. The studio
   never uploads to Instagram (`platformPublishSupport.instagram = false`); the owner posts in the
   app and pastes the link, and the studio polls that publication.
6. **TikTok publishes as an inbox draft (OD6, Q2 a).** The studio uploads; the owner finishes the
   post in the TikTok app; the link is captured when TikTok reports it within 24 hours, else pasted.
7. **Per-platform gates (OD2).** Each platform has `metrics` and `publish` gates, changed only by
   the owner; a gated capability requests no scope, accepts no request and runs no poll. Connected
   accounts, gates, health and the poll cursor are files under `<data home>/platform/` (section 26
   of `docs/RUN-FORMAT.md`), because the watcher must write two of them and never writes SQLite.

Deciding reasons: the watcher already runs between runs under launchd and is the single run
writer, so it can hold the one refreshing token user and survive `studio stop`; the stdin write
keeps tokens out of argv without a native dependency; and the batch-file import keeps K1 and K8
and reuses an import path that is already tested.

## Options considered and rejected

### Which process uploads (Q1)

- **(b) The api, as a background job.** Starts at once. Rejected: an upload dies with
  `studio stop`; two processes would refresh tokens and need a stricter lock than `token.lock`; the
  api would gain outbound calls beyond connect and disconnect.
- **(c) The watcher in a second lane, parallel to a run.** Starts at once and survives the api.
  Rejected: it breaks "one thing at a time" in the watcher and needs new crash rules for an upload
  that overlaps a run.
- Accepted cost of (a): a click made while a run executes waits, at most until the 2-hour expiry
  (B5); it never fires later on its own.

### How pulled metrics enter the snapshot store (Q3)

- **(b) The same batch file, plus a migration that rebuilds the snapshot table to allow source
  `api`.** Literal labels and separate keys. Rejected: it would be the first table redefinition in
  the project, which K8 forbids (it silently drops CHECK constraints and triggers on SQLite).
- **(c) The watcher writes SQLite through the handler.** No inbox. Rejected: it ends the "watcher
  never writes SQLite" rule that three specs kept (ADR 0003, SPEC 0006 K1).
- Accepted cost of (a): the stored source word is `csv` for a pulled snapshot (the view shows
  `api` from the import's origin), and an API pull and a CSV upload on the same day replace each
  other.

### How tokens are written to the Keychain without a terminal (Q5)

- **(b) A native keyring package after dependency vetting.** A cleaner API. Rejected: a new native
  dependency in the api and the watcher (K9, supply-chain surface).
- **(c) `security ... -w <value>` in argv.** Simplest. Refused outright: the token is visible to
  `ps` for a moment, which violates K3.

## Consequences

Easier:

- One process owns every platform call after connect, so quotas, backoff, token refresh and the
  "no second upload" rule live in one place.
- An upload never blocks the api; a large file is streamed from disk by the watcher.
- Pulled metrics need no new scoring code: SPEC 0006's import, snapshot and score rules apply
  unchanged; `QUALITY_SCORE_FORMULA_VERSION` stays 2.
- Closing a gate stops a platform at once without a deploy; disconnect deletes its tokens.

Harder:

- A click waits while a run executes, up to 2 hours, then expires.
- A token in the login Keychain is readable by `/usr/bin/security` for any process of the owner's
  user, as the provider keys already are. **Accepted risk (owner, 2026-11-21):** each item is
  written with `-T /usr/bin/security` (SPEC 0007 section 5.3), so that program reads it with no
  prompt, and any process running as the owner can run that program. This is what lets the
  watcher publish and import metrics unattended. Dropping `-T` would make macOS ask on every
  read. The owner accepted this exposure, the same one the provider keys carry, rather than
  give up unattended work. Mitigations kept: one item per platform, tokens passed only on stdin
  (B10), never in argv, files or logs (K3), and disconnect always deletes the item.
- Two files gain an exception to one writer per file: a batch file is created by the watcher and
  deleted by its ingester.
- Platform APIs, quotas and review rules change without notice (two such changes are dated within
  the last year, SPEC 0007 section 5.1); each live client re-reads its pages before coding.
- An upload whose outcome is unknown can lead to a duplicate if the owner clicks again without
  looking; the dialog says so.

We commit to maintain: the K3 token rule (inspection at every change of the vault, the callback,
the clients and the loggers); the outbound host allowlist of SPEC 0007 section 5.1; `token.lock`
around every Keychain write and delete; the `docs/RUN-FORMAT.md` sections 25 and 26 and the zod
schemas in `@studio/shared/platforms` as their executable form.

Revisit when:

- Meta documents loopback redirects for Instagram Login, or the owner wants Instagram publishing:
  reopen Q4 (Facebook Login for Business with a linked Page is the documented way to upload a local
  file).
- TikTok audits the app for direct posting, or restricts inbox uploads for unaudited clients (U7).
- A second account per platform, a second Mac or any remote access appears: the vault's one item
  per platform and the loopback redirect stop being enough.
- An upload while a run executes becomes a real need: reconsider Q1 (c) with crash rules.
- The macOS `security -i` stdin behaviour changes (B10): re-run the check before any vault change.
- Any software the owner does not trust runs under the owner's macOS user, or the studio gains
  a second macOS user: reconsider the accepted `-T /usr/bin/security` risk. Options are a
  dedicated keychain with its own password, or a signed helper as the only trusted application.
