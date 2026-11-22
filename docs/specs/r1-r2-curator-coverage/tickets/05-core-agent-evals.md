# 05-core-agent-evals: Topology v1 tool and agent evals, Mastra assumptions

## Description
The four read-only agent tools and the five topology v1 agents are covered by the evals planned in
topology 0001 section 11, and a test confirms or refutes each of the six Mastra API assumptions of
R1-13 against the installed Mastra version.

## Requirements
CR5, CR6, CR7, CR13

## Technical details
- Code under test: `packages/core/src/agents/tools/` (catalog search, asset describe, run artifact
  read, frame sample), `packages/core/src/agents/packets/`, `agent-roster.ts` (planner,
  scriptwriter, scene-director, reviewer, recovery), `packages/core/src/agents/adapters/`.
- Uses `createCoverageHome` and `fixtures` (contract
  `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` section 8.1), read-only.
- Files: `packages/core/src/agents/__tests__/tools.eval.test.ts`,
  `packages/core/src/agents/__tests__/agents.eval.test.ts`,
  `packages/core/src/agents/__tests__/mastra-assumptions.test.ts`.
- Existing tool tests in `packages/core/src/agents/tools/*.test.ts` are not counted (OQ8 default)
  and not changed.
- The frame sample tool runs on a generated fixture clip only when ffmpeg is present; otherwise its
  frame cases are `test.skip` with the reason "ffmpeg not found" and the ledger counts them as
  unavailable.
- Owner agent: test-writer.

## dependsOn
01-coverage-harness

## Acceptance criteria
1. `tools.eval.test.ts` holds at least 20 goldens and at least 12 negatives: a biometric row or
   ref is never returned (`ERROR_SENSITIVE_ASSET`); a deprecated version is never returned; an
   unoffered ref gives `ERROR_REF_NOT_OFFERED`; injection text stays inside the delimiters; the
   25th frame in a step gives the budget error; an out-of-range timestamp gives a typed error;
   Scene director asking for `events-tail` is refused; the sentinel secret and a biometric path
   never reach `_result`.
2. `agents.eval.test.ts` holds at least 5 cases per agent (at least 25): the packet builder omits
   every "never sees" item of topology 0001 section 2; the faked output parses with the strict
   schema; every field the next hop consumes is present.
3. `mastra-assumptions.test.ts` holds one case per assumption (6), each naming the assumption and
   the installed Mastra version; a refuted assumption is reported as a finding.

## Testing requirements
Author the three files above. No existing test is changed or weakened.

## Definition of Done
1. Files only under `packages/core/src/agents/__tests__`.
2. Every provider faked; no network, Keychain or home directory access.
3. Case counts in the return match the files.
4. Product defects and refuted assumptions are reported with file and line, never patched.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/agents/__tests__`
- dependsOn: 01-coverage-harness
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 8.1, consumer)
