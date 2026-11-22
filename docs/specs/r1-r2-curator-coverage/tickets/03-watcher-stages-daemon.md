# 03-watcher-stages-daemon: Stages, adapters, daemon and v1 end-to-end eval

## Description
Stage executors, the port adapters and the daemon are pinned by tests under mock ports, and the
topology v1 end-to-end eval proves a fully mocked run reaches `review` with pinned refs and a
consistent zero-cost ledger.

## Requirements
CR3, CR13

## Technical details
- Code under test: `apps/watcher/src/stages/`, `apps/watcher/src/adapters/`,
  `apps/watcher/src/daemon/`.
- Uses `startMockEngine`, `createWatcherHome`, `stubProcessIdentity` (contract
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` section 8.2), read-only.
- Files: `apps/watcher/src/stages/__tests__/stage-executors.test.ts`,
  `apps/watcher/src/adapters/__tests__/adapters.test.ts`,
  `apps/watcher/src/daemon/__tests__/daemon-pickup.test.ts`,
  `apps/watcher/src/daemon/__tests__/end-to-end.eval.test.ts`.
- Executors that need ffmpeg or Chromium are exercised through their mock ports only; running the
  real binaries is owner-run (OQ2).
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. Each stage executor registered in `executor-registry.ts` has at least one passing case under mock
   ports and one case for its typed failure.
2. Each adapter maps its port result and its port error as documented.
3. The daemon picks up a run whose `control.json` carries `resume: true` while no watcher is alive,
   and ignores it while one is alive (`stubProcessIdentity`).
4. `end-to-end.eval.test.ts`: the run reaches `review`; `manifest.json` pins every ref with its
   content hash; `cost.json` total equals the sum of sessions; spend is $0 (topology 0001
   section 11, end-to-end row).

## Testing requirements
Author the four files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under the three exclusive folders.
2. No real binary, provider, network, Keychain or home directory access.
3. Product defects are reported with file and line, never patched.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `apps/watcher/src/stages/__tests__`, `apps/watcher/src/adapters/__tests__`,
  `apps/watcher/src/daemon/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8.2, consumer)
