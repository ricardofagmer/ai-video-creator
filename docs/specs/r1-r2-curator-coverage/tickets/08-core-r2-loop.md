# 08-core-r2-loop: Core R2 loop tests

## Description
The R2 improvement loop modules of core are pinned by tests: quality, embeddings, promotion,
learnings and comparisons.

## Requirements
CR10, CR13

## Technical details
- Code under test: `packages/core/src/quality/`, `embeddings/`, `promotion/`, `learnings/`,
  `comparisons/` (SPEC 0003).
- Uses `createCoverageHome` and `fixtures` (contract
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` section 8.1), read-only. Embeddings use the
  existing mock embedding port.
- One `__tests__` folder per module, each with at least one `<module>.test.ts`.
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. Each of the 5 modules has passing cases for its main service operations and at least one typed
   error.
2. Learnings: retired notes, notes after the run's cutoff and notes on biometric versions never
   reach a stage brief (topology 0004 section 2).
3. Promotion: a version is promoted only when its documented rule holds; otherwise it stays
   `draft` with the reason.
4. Comparisons and quality: scores derive only from reviewed runs.

## Testing requirements
Author one test file or more per module folder. No existing test is changed or weakened.

## Definition of Done
1. Files only under the 5 exclusive folders.
2. Every provider faked; no network, Keychain or home directory access.
3. Product defects are reported with file and line, never patched.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/quality/__tests__`, `packages/core/src/embeddings/__tests__`,
  `packages/core/src/promotion/__tests__`, `packages/core/src/learnings/__tests__`,
  `packages/core/src/comparisons/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8.1, consumer)
