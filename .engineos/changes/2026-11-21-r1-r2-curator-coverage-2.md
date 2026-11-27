---
name: 2026-11-21-r1-r2-curator-coverage-2
status: active
owner: Ricardo
spec: docs/specs/2026-11-21-r1-r2-curator-coverage.md
domain: test
security_review: pending
preview: none
risk: medium
new_feature: false
release: false
---

# R1, R2 and curator test and eval coverage (run 2)

## What

Second super-dev run of `r1-r2-curator-coverage`: 11 test-writer tickets that add the tests and
evals critic major 2 found missing (watcher engine, stages, daemon, curation; core agents, curator,
R1 data, R2 loop; api routes; CLI and toolbox), then a coverage ledger.

## Why

The first run (`.engineos/super-dev/2026-11-21-r1-r2-curator-coverage/`, record
`.engineos/archived/2026/11/test/2026-11-21-r1-r2-curator-coverage.md`) was discarded. R1, R2 and
the curator cannot be called verified without this coverage.

## Scope

- In: the exclusive paths of tickets 01 to 11 in `docs/specs/r1-r2-curator-coverage/tickets/`.
- Out: product code changes, migrations, live providers, the web test runner (OQ4), owner-run
  R1-FP items (OQ1, OQ2, OQ5, OQ6).

## Checklist

- [x] Prepare: run state `prepared`, traceability with no gap
- [x] Review: six answers recorded in `approval.json` (status `approved`, source 24fbef4 on `main`)
- [ ] Run: tickets 01 to 11 completed
- [ ] Final checks once after the last ticket, output shown
- [ ] Security reviewer and critic (if approved at review)
- [ ] CONFIRM or DISCARD by the owner

## What was made

- Run directory `.engineos/super-dev/2026-11-21-r1-r2-curator-coverage-2/` with `state.json`
  (status `prepared`) and `log.jsonl` (`run-prepared`).
- Ticket 01 (harness): 11 test-support files under `packages/core/src/test-support/` (5) and
  `apps/watcher/src/test-support/` (6), with one isolation test per package.
- Ticket 02 (watcher engine): 6 test files under `apps/watcher/src/engine/__tests__/`.
- Ticket 07 (core R1 data): 8 test files, one each under catalog, costs, outcomes, providers,
  recipes, review, runs and seed `__tests__` in `packages/core/src/`.
- Ticket 09 (api routes): 7 test files under `apps/api/src/__tests__/`.
- Ticket 10 (CLI and toolbox): 12 test files under `packages/toolbox/src/__tests__/`, 3 under
  `tools/cli/src/__tests__/`, and a `test` script in `packages/toolbox/package.json`.
- Ticket 03 (watcher stages, adapters, daemon): `stage-executors.test.ts` (49 cases written, 67 at
  runtime), `adapters.test.ts` (25), `daemon-pickup.test.ts` (6), `end-to-end.eval.test.ts` (5) and
  the helper `daemon-world.harness.test.ts` (no cases). Possible red at the final run:
  `end-to-end.eval.test.ts:79` and `:95` depend on the mock package manifests.
- Every ticket's patch is in the run's `checkpoints/` folder. Nothing has been executed yet: tests
  and typecheck run once at the final gate.

## Not done

- Review, run, final checks and reviews are pending.

## User checklist

- Answer the six review questions.
- Owner-run items listed in the PRD open questions.

## Verification

[validation] pending — final-stage user approval required

## Human decisions

| When | Who | Reason ids | Decision |
|---|---|---|---|
| 2026-11-21 | Ricardo | none | "Prepare coverage run": start a new super-dev run after the discarded one |
| 2026-11-21 | Ricardo | none | Review Q1 execution plan: approved ("Approve (Recommended)"); highRiskTicketIds none; protected path `packages/toolbox/package.json` (ticket 10, test script only); scopeRevision `sha256:31d075962aec88ef8ab0a431a012fd0a08604b0886e60d63ebc7779848fc01d2` |
| 2026-11-21 | Ricardo | none | Review Q2 preview: declined ("No preview (Recommended)") |
| 2026-11-21 | Ricardo | none | Review Q3 check plan: approved ("Approve (Recommended)"): final-1..8 once after the last ticket; final-4 `pnpm test` mutates only mkdtemp SQLite (dbConfirmation recorded) |
| 2026-11-21 | Ricardo | none | Review Q4 security: approved ("Approve (Recommended)"): security-reviewer, critic, `pnpm audit --audit-level=high` |
| 2026-11-21 | Ricardo | none | Review Q5 git checkpoints: state-only ("State-only (Recommended)") |
| 2026-11-21 | Ricardo | none | Review Q6 budget: defaults 12 / 240 / 2 / 1 / 2 ("Accept defaults (Recommended)") |
| 2026-11-22 | Ricardo | none | Re-review after `approval-mismatch` (HEAD 24fbef4 -> 4ab39ad, design-system commit, no ticket paths): Q1 execution plan approved ("Approved (Recommended)"); highRiskTicketIds none; protected path unchanged; scopeRevision `sha256:31d075962aec88ef8ab0a431a012fd0a08604b0886e60d63ebc7779848fc01d2` unchanged |
| 2026-11-22 | Ricardo | none | Re-review Q5 git checkpoints: state-only ("State-only (Recommended)"); commit not offered (default branch, dirty tree) |
| 2026-11-22 | Ricardo | budget-exhausted | Re-review Q6 budget: extended ("Extend 240 min from now (Recommended)"): maxWallClockMinutes 240 -> 810 after 568 min elapsed while the run stalled; other bounds unchanged |

## Changes registered

- None yet (prepare writes only git-ignored run files and this record).

## Notes

- The run would execute on `main`; a feature branch before the run is a git write, raised at
  review.
- Proposal, not applied: ticket 10 could name the `run-gate` approve and reject commands; AC1
  already covers every CLI command.
