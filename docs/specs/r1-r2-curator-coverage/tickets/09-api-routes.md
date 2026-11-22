# 09-api-routes: api route tests

## Description
The api's routes are pinned by tests against a Nest test server on `127.0.0.1`: session and
authorization, object-level access, input validation, run control and heartbeat, and by-reference
path validation.

## Requirements
CR11, CR13

## Technical details
- Code under test: `apps/api/src/` controllers, guards and DTOs (route table
  `apps/web/src/lib/api/route-table.ts`, read-only reference).
- No dependency on ticket 01: the api builds its own temp data home inside
  `apps/api/src/__tests__/api-test-home.ts` with the same rules as section 8.1 of
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (realpath'd temp root, database inside it,
  sentinel credential, never the Keychain).
- Files: `apps/api/src/__tests__/api-test-home.ts`, `session.test.ts`, `authorization.test.ts`,
  `validation.test.ts`, `run-control.test.ts`, `by-reference.test.ts`, `isolation.test.ts`.
- Owner agent: test-writer.

## dependsOn
none

## Acceptance criteria
1. Every route that needs a session refuses a request without one.
2. A request for another owner's object is refused (object-level check), where the route has one.
3. Oversized bodies and invalid fields are refused with a client error that leaks no stack, query
   or path.
4. Run control writes a valid `control.json` (`ControlRequestSchema`) and the heartbeat route
   reports the watcher state without probing a real pid.
5. By-reference registration refuses `..`, symlinks out of the allowed root and paths under
   `ricardo-clone/` handled only by reference, never read.
6. `isolation.test.ts` follows section 8.3 for the api package.

## Testing requirements
Author the files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under `apps/api/src/__tests__`.
2. Server bound to `127.0.0.1` on an ephemeral port and closed in `afterEach`.
3. Product defects, including security findings, are reported with file and line, never patched.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `apps/api/src/__tests__`
- dependsOn: none
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (sections 8.1 rules and 8.3)
