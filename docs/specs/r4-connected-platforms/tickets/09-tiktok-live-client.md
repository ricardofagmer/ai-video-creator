# 09-tiktok-live-client: TikTok live client (R4-09)

**What to build:** The live `PlatformClient` for TikTok: desktop login with PKCE, the inbox draft upload, and metrics from the video query.

**Blocked by:** 02-core-platforms; Q2 answered (inbox draft); owner: a TikTok developer app with Login Kit, Content Posting API and Display API, and the checks U5, U6, U7

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 63 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 5.1, 5.2, 5.5, 5.7. Hosts: `www.tiktok.com`, `open.tiktokapis.com`, and the returned `upload_url` host under the B12 suffix rule. PKCE S256 with the **hex** challenge. Scopes: `user.info.basic`, `video.list`, `video.upload`. Publish (Q2 option a): `/v2/post/publish/inbox/video/init/` with `FILE_UPLOAD`, chunked PUT, `status/fetch`; `SEND_TO_USER_INBOX` maps to `sent-to-inbox`; `PUBLISH_COMPLETE` with a public post id maps to `published`. Metrics: `/v2/video/query/` in groups of 20. The refresh token changes on every refresh: write the new bundle under `token.lock` before using the new access token. Re-read [T1] to [T8] before coding and report any drift.

## Acceptance criteria
- [ ] Every response is parsed by a strict zod schema before use; `upload_url` is validated before any byte is sent.
- [ ] A refresh never leaves the vault holding a spent refresh token.
- [ ] Direct post (`video.publish`) is not implemented unless the owner chose Q2 option (b).
- [ ] The owner-run record for AC 63 is attached before the TikTok gate is called done; until then the gate stays `awaiting-review`.

## Testing requirements
None in this ticket. Mapper and request-builder tests are written at the final gate from recorded, redacted response shapes (no real ids, no tokens). The live check of AC 63 is owner-run and is never executed by an agent.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/platforms/clients/tiktok`
- dependsOn: 02-core-platforms
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
