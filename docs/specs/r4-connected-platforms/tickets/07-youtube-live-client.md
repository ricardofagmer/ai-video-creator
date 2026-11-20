# 07-youtube-live-client: YouTube live client (R4-07)

**What to build:** The live `PlatformClient` for YouTube: OAuth on a Desktop client, resumable upload, and metrics from the Data and Analytics APIs.

**Blocked by:** 02-core-platforms; owner: a Google Cloud project with the YouTube Data and Analytics APIs enabled, an OAuth Desktop client, and the checks U1, U2, U8

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 63 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 5.1, 5.2, 5.5, 5.7. Hosts: `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `youtubeanalytics.googleapis.com`. Scopes: `youtube.readonly`, `yt-analytics.readonly`, `youtube.upload`. PKCE S256 base64url. Upload: resumable session on `/upload/youtube/v3/videos` with `snippet` (title, description, tags) and `status` (`privacyStatus`, `containsSyntheticMedia`, `selfDeclaredMadeForKids: false`). Metrics: `videos.list` statistics in groups of 50 plus one Analytics query per video. Revoke on `oauth2.googleapis.com/revoke`. Re-read each doc page of section 5.1 [G1] to [G6] before coding and report any drift.

## Acceptance criteria
- [ ] Every response is parsed by a strict zod schema before use; error bodies become reason ids and are dropped.
- [ ] Only the four hosts are contacted; redirects to another host are refused.
- [ ] Quota and 429 answers map to `quota-exhausted` / `rate-limited`; no retry beyond the transport resume of B9.
- [ ] The owner-run record for AC 63 is attached before the YouTube gate is called done.

## Testing requirements
None in this ticket. Mapper and request-builder tests are written at the final gate from recorded, redacted response shapes (no real ids, no tokens). The live check of AC 63 is owner-run and is never executed by an agent.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/platforms/clients/youtube`
- dependsOn: 02-core-platforms
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
