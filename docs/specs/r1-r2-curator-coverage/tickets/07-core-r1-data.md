# 07-core-r1-data: Core R1 data tests

## Description
The R1 data modules of core are pinned by tests: catalog, recipes, runs, review, outcomes, costs,
seed (idempotent on a synthetic seed root) and providers.

## Requirements
CR9, CR13

## Technical details
- Code under test: `packages/core/src/catalog/`, `recipes/`, `runs/`, `review/`, `outcomes/`,
  `costs/`, `seed/`, `providers/`.
- Uses `createCoverageHome` and `fixtures` (contract
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` section 8.1), read-only.
- One `__tests__` folder per module, each with at least one `<module>.test.ts`.
- Seed idempotency runs on a synthetic seed root created inside the temp home; the real catalog
  seed, which would hash files under `ricardo-clone/`, is owner-run (OQ1).
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. Each of the 8 modules has passing cases for its main service operations and at least one typed
   error.
2. Catalog: a biometric asset is never returned by search; a deprecated version is excluded; the
   content hash matches the stored file.
3. Recipes: `recipeContentHashInput` ignores status and timestamps and keeps the version.
4. Costs: the month ceiling does not count the live run's spend twice.
5. Seed: a first run on the synthetic root reports created, a second reports unchanged.
6. Providers: each provider resolves to its mock in test mode; no real client is constructed.

## Testing requirements
Author one test file or more per module folder. No existing test is changed or weakened.

## Definition of Done
1. Files only under the 8 exclusive folders.
2. No network, Keychain, home directory or `ricardo-clone/` access.
3. Product defects are reported with file and line, never patched.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/catalog/__tests__`, `packages/core/src/recipes/__tests__`,
  `packages/core/src/runs/__tests__`, `packages/core/src/review/__tests__`,
  `packages/core/src/outcomes/__tests__`, `packages/core/src/costs/__tests__`,
  `packages/core/src/seed/__tests__`, `packages/core/src/providers/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8.1, consumer)
