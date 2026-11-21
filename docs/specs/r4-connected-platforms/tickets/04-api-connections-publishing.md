# 04-api-connections-publishing: Api: connections, gates, publishing routes and sync (R4-04)

**What to build:** The rev 7 routes: OAuth start and callback, disconnect, gates, the publish view, request and cancel, and the two sync services that copy watcher results into SQLite.

**Blocked by:** 02-core-platforms

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 39
- AC 40
- AC 41
- AC 42
- AC 44
- AC 45
- AC 46
- AC 47
- AC 49
- AC 52
- AC 62 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 4.4, 5.2, 5.3, 5.4, 5.6. New folders `apps/api/src/connections/` and `apps/api/src/publishing/` (not `platform/`, which is HTTP plumbing). In-memory `state` store bound to the session id (10 minutes, single use, at most 5). The callback keeps the session guard, sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and redirects to the web with a reason id only. `PublishAttemptSync` and `MetricInboxSync` run at bootstrap in the background and before the reads section 5.4 and 5.6 name, as `RunIndexSync` does. Map the rev 7 reasons in `error-mapping.ts`. Update the route comment that says no route publishes.

## Acceptance criteria
- [ ] Every rev 7 route answers 401 without a session; non-GET routes refuse a foreign `Origin` (AC 62).
- [ ] A callback with a bad, reused, expired or other-session `state`, or with `error`, stores nothing (AC 40).
- [ ] The api calls a platform only inside connect (exchange, identity) and disconnect (revoke); `apps/api/src/publishing/**` makes no outbound request; the publish POST answers 202 without waiting (AC 52).
- [ ] The api writes none of `health.json`, `claim`, `state.json`, `cursor.json`, `publications.jsonl` (AC 57).
- [ ] `requestedBy`, `connectedBy` and timestamps come from the session and the server clock, never from a body.
- [ ] No response returns a token, a client secret, a title, a caption or a tag.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 10-final-proof), after the owner's approval. Keep the code testable: inject the clock, the vault, the file root and the platform client.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `apps/api`
- dependsOn: 02-core-platforms
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
