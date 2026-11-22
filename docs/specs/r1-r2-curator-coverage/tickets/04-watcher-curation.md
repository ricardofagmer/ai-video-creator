# 04-watcher-curation: Watcher curation and curator end-to-end eval

## Description
The watcher's curation flow is pinned by tests, and the curator end-to-end eval proves the owner's
sample request produces a grounded draft proposal that starts nothing.

## Requirements
CR4, CR8, CR13

## Technical details
- Code under test: `apps/watcher/src/curation/`.
- Uses the watcher harness (section 8.2 of
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1`), read-only. Core's `test-support` is not
  a package export, so catalog rows come from the watcher's mock ports and the fixture run, not from
  a cross-package import. The Curator model is the existing mock responder
  (`packages/core/src/agents/curator/curator-mock.responder.ts`).
- Files: `apps/watcher/src/curation/__tests__/curation-flow.test.ts`,
  `apps/watcher/src/curation/__tests__/curator-end-to-end.eval.test.ts`.
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. The curation flow's documented states and typed failures each have a passing case.
2. `curator-end-to-end.eval.test.ts` (1 case, topology 0004 section 11 end-to-end row): the owner
   asks for a proposal on `prompt-narration-pt@3` with 6 reviewed runs rated 2, 3, 2, 4, 2, 3 and the
   active note "legendas a 74% de altura cobrem botões em 16:9"; the faked Curator proposes v4; the
   ground check passes; the proposal names the asset, the diff, the reason and at least one
   evidence run (AC 33); v4 is saved as `draft` with provenance `curator`; no run is started.
3. Curation spend recorded for the case equals the faked session cost.

## Testing requirements
Author the two files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under `apps/watcher/src/curation/__tests__`.
2. Every provider faked; no network, Keychain or home directory access.
3. Product defects are reported with file and line, never patched.
4. Return lists files, case counts and findings.

## EngineOS brief metadata
- Exclusive paths: `apps/watcher/src/curation/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (sections 8.1 and 8.2, consumer)
