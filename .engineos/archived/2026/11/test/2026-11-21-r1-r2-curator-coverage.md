---
name: 2026-11-21-r1-r2-curator-coverage
status: closed
owner: Ricardo Fagmer
spec: docs/specs/2026-11-21-r1-r2-curator-coverage.md
domain: test
security_review: not-required
preview: declined
risk: medium
new_feature: false
release: false
---

## What
Tests and evals for R1, R2 and the curator (critic major 2), the 24 curator evals and the topology
v1 evals with every provider faked, the open R1-FP checks, and a coverage ledger. Run through
super-dev `2026-11-21-r1-r2-curator-coverage`.

## Why
The 2026-11-21 critic pass found 0 test files under the watcher engine and curation and core
agents, curation, costs, review and runs, and the 24 curator evals were never written
(`.engineos/changes/2026-11-18-r1-implementation.md` line 128).

## Scope
Test files only, in `__tests__` and `test-support` folders listed per ticket in
`docs/specs/r1-r2-curator-coverage/tickets/`, plus a `test` script in
`packages/toolbox/package.json` and the ledger `docs/specs/r1-r2-curator-coverage/coverage-ledger.md`.
No product code change.

## Checklist
- [x] Prepare: PRD, spec rev 1, 11 tickets, graph, traceability (2026-11-21)
- [x] Review: six questions answered and recorded (2026-11-21, run status `approved`)
- [ ] Run: tickets 01 to 10 integrated (not run; run closed 2026-11-21)
- [ ] Final proof: ticket 11 checks and ledger
- [ ] Security reviewer and critic, if approved at review
- [x] Closed: run discarded by the owner 2026-11-21, nothing to restore or delete

## What was made
Prepare only so far: `docs/prds/2026-11-21-r1-r2-curator-coverage.md`,
`docs/specs/2026-11-21-r1-r2-curator-coverage.md`, 11 ticket files and `graph.md` under
`docs/specs/r1-r2-curator-coverage/tickets/`, and the run state under
`.engineos/super-dev/2026-11-21-r1-r2-curator-coverage/` (git-ignored).

## Not done
Closed by the owner on 2026-11-21 ("Close the test run (Recommended)"): super-dev status `discarded`, no ticket ran, no file was written, nothing restored or deleted. The PRD, spec and tickets stay as reference for a later test pass. `security_review: not-required`: the review covered only the test files this run would have written, and none exist.

Earlier state: Run paused by the owner on 2026-11-21 before any ticket finished (wave 1 workers for 01, 09 and 10
were stopped; they had written no files). All 11 tickets are pending. Resume with
`/super-dev resume` after the remaining product work; a new HEAD or changed spec files send the run
back to review first.

## User checklist
- [x] Answer the six review questions
- [ ] Owner-run items after the run: real catalog seed (OQ1), mock runs through the real executors
      (OQ2), Next 15 assumptions (OQ5), R1-04 fixture pins (OQ6), the live eval suite
- [ ] CONFIRM or DISCARD at the report

## Verification
[validation] pending — final-stage user approval required

## Human decisions
2026-11-21 | Ricardo Fagmer | none | approved | "Continue super-dev prepare (Recommended)"; prepare written while `/bypass` was on (EngineOS process off; safety rules kept)
2026-11-21 | Ricardo Fagmer | super-dev review Q1 execution plan | approved | "Approve (Recommended)"; 11 tickets, 3 waves, no high-risk tickets; scopeRevision sha256:c41112cd3d8ef61d556f5afa840e51ca0a16439b84e7c913365f4f680a9b45a5
2026-11-21 | Ricardo Fagmer | super-dev review Q2 preview | declined | "No preview (Recommended)"; scopeRevision sha256:c41112cd…b45a5
2026-11-21 | Ricardo Fagmer | super-dev review Q3 check plan | approved | "Approve (Recommended)"; final-1..final-8 once after the last ticket, final-4 (`pnpm test`) mutates only mkdtemp SQLite (dbConfirmations recorded); protected path packages/toolbox/package.json for 10-cli-toolbox; scopeRevision sha256:c41112cd…b45a5
2026-11-21 | Ricardo Fagmer | super-dev review Q4 security review | approved | "Approve (Recommended)"; security-reviewer and critic at the final gate, scan `pnpm audit --audit-level=high` (read-only network); scopeRevision sha256:c41112cd…b45a5
2026-11-21 | Ricardo Fagmer | super-dev review Q5 git checkpoints | approved | "State-only (Recommended)"; no git writes during the run; scopeRevision sha256:c41112cd…b45a5
2026-11-21 | Ricardo Fagmer | super-dev review Q6 budget | approved | "Accept defaults (Recommended)"; 12 tickets, 240 minutes, 2 fixes per check, 1 escalation; scopeRevision sha256:c41112cd…b45a5
2026-11-21 | Ricardo Fagmer | run close | approved | "Close the test run (Recommended)"; run discarded, no files written; security review not required (no code)
2026-11-21 | Ricardo Fagmer | run pause | approved | "Pause the whole run now"; tests wait until the remaining product work is finished; run status `paused`, no files written

## Changes registered
Filled on completion.

## Notes
- `coverage/` is git-ignored (`.gitignore` line 7), so test folders are named `__tests__` (spec D1).
- Core `test-support` is not a package export; watcher tests use only the watcher harness.
