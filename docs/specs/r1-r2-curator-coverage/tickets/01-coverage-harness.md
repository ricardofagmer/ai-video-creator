# 01-coverage-harness: Coverage harness and isolation tests

## Description
Every later test gets a safe place to run: an isolated temp data home with a migrated throwaway
database (core), a mock watcher engine on a fixture run (watcher), fixture builders, a sentinel
credential, and an isolation test per package that fails when a test reaches the real home, the
Keychain, the network, a child process, `ricardo-clone` or uses `.only`.

## Requirements
CR1, CR13

## Technical details
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` section 8 (8.1, 8.2, 8.3). This
  ticket is its owner and builds it exactly as written.
- Core: `packages/core/src/test-support/coverage-home.ts`, `fixtures.ts`, `index.ts`,
  `isolation.test.ts`, `coverage-home.test.ts`. `createCoverageHome` wraps `createPlatformHarness`
  (`packages/core/src/platforms/platform-harness.harness.test.ts` lines 108 to 134); if that
  function cannot be imported without moving it, re-export it through a thin adapter in this folder
  and report the reason (the platforms file is outside this ticket).
- Watcher: `apps/watcher/src/test-support/mock-engine.ts`, `watcher-home.ts`,
  `process-identity.ts`, `index.ts`, `isolation.test.ts`, `mock-engine.test.ts`, following
  `apps/watcher/src/dev/run-fixture.ts` lines 40 to 60.
- Owner agent: test-writer.

## dependsOn
none

## Acceptance criteria
1. `createCoverageHome` returns a root under the realpath of `os.tmpdir()`; the database file lies
   inside it (asserted before connecting); `close()` removes the root.
2. `startMockEngine()` runs the fixture to `review` with mock ports; with `withPlanApproval: false`
   it stops in `waiting`; `shutdown()` removes the runs root.
3. Each isolation test fails on a planted temp file containing each forbidden pattern and passes on
   the real test tree (the planted file lives in a temp folder, never in `src`).
4. The sentinel key never appears in captured logs after a fixture run.

## Testing requirements
Author `coverage-home.test.ts`, `mock-engine.test.ts` and the two `isolation.test.ts` files.
No existing test is changed.

## Definition of Done
1. Every symbol of section 8.1 and 8.2 exists with the frozen signature.
2. Files are only under the exclusive paths.
3. No `any`, no `as` used to silence errors, no `.only`, no real home or Keychain access.
4. Return lists files created and any contract concern under `### Out of scope`.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/test-support`, `apps/watcher/src/test-support`
- dependsOn: none
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8, owner)
