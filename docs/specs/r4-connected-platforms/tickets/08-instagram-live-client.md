# 08-instagram-live-client: Instagram live client (R4-08)

**What to build:** The live `PlatformClient` for Instagram: login, reel upload from the local file, and media insights.

**Blocked by:** 02-core-platforms; Q4 answered (Facebook Login for Business); owner: a Meta developer app, a Business or Creator account (and a linked Facebook Page under Q4 option a), and the checks U3 and U4

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 63 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 5.1, 5.2 (redirect fallback), 5.5, 5.7. Hosts: `www.facebook.com`, `graph.facebook.com`, `rupload.facebook.com`. Start with the owner-run redirect check and implement only the highest-ranked fallback that works. Publish: container with `media_type=REELS` and `upload_type=resumable`, upload to `rupload`, status checks, `media_publish`; read `content_publishing_limit` first. Metrics: media insights; resolve a shortcode to a media id by listing the account's media, at most 5 pages a pass. Token: exchange for the long-lived token; re-extend under `token.lock`. Under Q4 option (b) the upload methods answer `account-not-eligible` and only metrics ship. Re-read [M1] to [M6] before coding and report any drift.

## Acceptance criteria
- [ ] Every response is parsed by a strict zod schema before use; the app secret never appears in a URL the studio logs or stores.
- [ ] Only the three hosts are contacted.
- [ ] If fallback (b) is used, the `localhost` redirect holds no logic and stores nothing; if (c), the pasted address is parsed for `code` and `state` only and never stored.
- [ ] The owner-run record for AC 63 is attached before the Instagram gate is called done; until then the gate stays `awaiting-review`.

## Testing requirements
None in this ticket. Mapper and request-builder tests are written at the final gate from recorded, redacted response shapes (no real ids, no tokens). The live check of AC 63 is owner-run and is never executed by an agent.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/platforms/clients/instagram`
- dependsOn: 02-core-platforms
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
