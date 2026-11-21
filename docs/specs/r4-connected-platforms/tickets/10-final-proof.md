# 10-final-proof: Final proof (final gate only, owner approval required) (R4-FP)

**What to build:** Evidence for AC 39 to 62 in mock mode: tests, inspection and one browser walk. Written and run only after the owner approves the final checkpoint.

**Blocked by:** 01 to 06 integrated; the owner's answer at the final checkpoint. Tickets 07 to 09 do not block it

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 39
- AC 40
- AC 41
- AC 42
- AC 43
- AC 44
- AC 45
- AC 46
- AC 47
- AC 48
- AC 49
- AC 50
- AC 51
- AC 52
- AC 53
- AC 54
- AC 55
- AC 56
- AC 57
- AC 58
- AC 59
- AC 60
- AC 61
- AC 62 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md section 12. Unit tests: `pollDue`, publish-state transitions, `capabilityStatus`, PKCE and `state`, metric mappers, URL rebuild. Integration tests on a temporary data home with the fake vault, an injected clock and the mock clients (each fault scenario): connect, callback refusals, disconnect race, publish request order, idempotency, expiry, cancel, watcher sweep, poll pass, backoff, batch ingest, score equality with a form snapshot, mock exclusion, insights count. Inspection greps of section 12. One browser walk in mock mode. The approved lint, typecheck, build and test commands, each once.

## Acceptance criteria
- [ ] Written and run only after approval; no `.only`; no live platform call; no network; no real token or account data in a fixture.
- [ ] Sentinel token strings are searched for in the data home, the database, the logs and every response (AC 41, 60).
- [ ] Every AC from 39 to 62 has named evidence with output shown; AC 63 is reported per platform as passed or pending, never assumed.

## Testing requirements
Tests are `src/**/*.test.ts` run by `node --import tsx --test` (the package `test` script). They touch no real data home, no real Keychain, no real SQLite file and no network: pure functions, in-memory fakes, and `fs.mkdtemp` folders under the OS temp directory. Never weaken, skip or `.only` a test.

## Definition of Done
- [ ] Every approved command ran once at the final revision, with its output shown; a red result is reported as red.
- [ ] No production file changed.
- [ ] `security-reviewer` and `critic` findings are listed with their state (risk high).

## EngineOS brief metadata
- Exclusive paths: test files and fixtures only (`**/*.test.ts`, fixtures); no production file
- dependsOn: 01-frozen-contracts, 02-core-platforms, 03-watcher-platform-steps, 04-api-connections-publishing, 05-web-accounts-publish, 06-cli-platforms
- Owner: test-writer
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
