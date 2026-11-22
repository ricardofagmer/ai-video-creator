# 11-final-proof: Final proof and coverage ledger

## Description
After every other ticket integrates, the final checks run once with output shown, and a coverage
ledger maps every critic-major-2 area, every eval count and every open R1-FP item to its test file
and result, recording owner-run items with their reason.

## Requirements
CR13, CR14, CR15

## Technical details
- Commands (spec section 9), outside the sandbox, build first: `pnpm build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `node tools/cli/dist/main.js --help`,
  `VIDEO_STUDIO_HOME=<temp> bash scripts/install.sh --dry-run`,
  `shellcheck scripts/install.sh scripts/uninstall.sh scripts/lib/common.sh` (unavailable when not
  installed), `pnpm --filter @studio/watcher dev:fixture`.
- The checks run only under the check plan approved at review (`rules/verification.md`
  Pre-authorized runs). The ledger is written from their output.
- File: `docs/specs/r1-r2-curator-coverage/coverage-ledger.md`.
- Owner agent: test-writer (ledger); the supervisor runs the checks.

## dependsOn
01-coverage-harness, 02-watcher-engine, 03-watcher-stages-daemon, 04-watcher-curation,
05-core-agent-evals, 06-core-curator, 07-core-r1-data, 08-core-r2-loop, 09-api-routes,
10-cli-toolbox

## Acceptance criteria
1. Each command's result (pass, fail, unavailable) and output tail is shown and recorded.
2. The ledger rows cover CR1 to CR15, each critic-major-2 area (watcher engine and curation; core
   agents, curation, costs, review, runs) and each open R1-FP item of
   `.engineos/changes/2026-11-18-r1-implementation.md` lines 70 to 73.
3. The ledger counts: 24 curator cases; at least 20 tool goldens and 12 negatives; at least 5 cases
   per topology v1 agent; 4 loop cases; 1 topology v1 end-to-end case; 6 Mastra assumptions.
4. Owner-run items (OQ1, OQ2, OQ5, OQ6, the live suite, and OQ3 when unavailable) are listed with
   their reason and never marked passed.

## Testing requirements
No test is authored here. The checks above are the evidence.

## Definition of Done
1. The ledger exists at its path and every count matches the test files.
2. No red check is reported as green; unavailable evidence is labelled unavailable.
3. The isolation tests of every package pass in `pnpm test`.

## EngineOS brief metadata
- Exclusive paths: `docs/specs/r1-r2-curator-coverage/coverage-ledger.md`
- dependsOn: 01-coverage-harness, 02-watcher-engine, 03-watcher-stages-daemon, 04-watcher-curation,
  05-core-agent-evals, 06-core-curator, 07-core-r1-data, 08-core-r2-loop, 09-api-routes,
  10-cli-toolbox
- Owner: test-writer
- Contract: `docs/specs/2026-11-21-r1-r2-curator-coverage.md@rev1` (section 9)
