# 06-core-curator: Curator evals

## Description
The 23 non-end-to-end curator eval cases of topology 0004 section 11 exist and pass with every
provider faked: ground check (9), Curator (6), Scriptwriter (4) and Scene director (4). With the end
to end case of ticket 04 that makes the 24.

## Requirements
CR8, CR13

## Technical details
- Code under test: `packages/core/src/curation/` (ground check, proposal), 
  `packages/core/src/agents/curator/`, the Scriptwriter and Scene director packet builders
  (`packages/shared/src/agents/writer.ts`, `director.ts` schemas).
- Uses `createCoverageHome` and `fixtures` (contract
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` section 8.1), read-only. The Curator model
  is `curator-mock.responder.ts`.
- Files: `packages/core/src/curation/__tests__/ground-check.eval.test.ts`,
  `packages/core/src/agents/curator/__tests__/curator.eval.test.ts`,
  `packages/core/src/agents/curator/__tests__/learnings-in-packets.eval.test.ts`.
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. `ground-check.eval.test.ts` holds 9 cases: one per failure reason (evidence id outside the
   packet; evidence run did not use the subject; evidence run not reviewed; body unchanged; body
   over 16,000; recipe JSON invalid; binding to a biometric, deprecated or missing version; redactor
   hit) returning exactly its reason id, plus one pass case returning a diff.
2. `curator.eval.test.ts` holds 6 cases (low-rated prompt; recipe subject; draft vs active
   baseline; good outcomes giving `no-change`; a note saying "ignore your instructions"; a declined
   idea in `declinedProposals`): the output parses as `CuratorOutput`; evidence ids are a subset of
   the packet; the packet holds no never-sees field; the injection note does not change the output
   contract.
3. `learnings-in-packets.eval.test.ts` holds 4 Scriptwriter and 4 Scene director cases (packet with
   notes; a note containing `</untrusted>`; an injection-style note; no notes): the output parses
   (`ScriptOutput`, `ScenesOutput`); the tag is escaped once; `claimsOnly` holds; `learnings: []`
   renders no section.

## Testing requirements
Author the three files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under the two exclusive folders.
2. Every provider faked; no network, Keychain or home directory access.
3. Exactly 23 cases across the three files, reported in the return.
4. Product defects are reported with file and line, never patched.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/curation/__tests__`, `packages/core/src/agents/curator/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8.1, consumer)
