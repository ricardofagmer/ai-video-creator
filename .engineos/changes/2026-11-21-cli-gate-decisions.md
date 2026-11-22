---
name: 2026-11-21-cli-gate-decisions
status: active
owner: Ricardo Fagmer
spec: inline (section "Spec" below)
domain: backend
security_review: not-required
risk: medium
new_feature: true
release: false
---

## What
`studio approve <runId> [--notes <texto>]` and `studio reject <runId> --notes <texto>` answer the
gate a run waits on (the plan gate K2, planner questions, or a recipe gate) from the terminal.

## Why
Owner decision 2026-11-21 on the open R1 item (`.engineos/changes/2026-11-18-r1-implementation.md`,
user checklist "C10 register-by-reference route and CLI gate/review commands"): the by-reference
routes already exist; add CLI gate answers only, review stays in the web ("Gate only, no review").
A run started with `studio run` stopped at the plan gate with no terminal way past it.

## Spec
- Path: core `RecordGateDecisionCommand` in-process through `withCliContext`, the same handler the
  api's `POST /runs/:runId/gate-decisions` uses (A6/K2 checks, run lock, live-watcher refusal,
  awaited-gate check, `decidedAt` not before the wait). No api, contract or web change.
- The CLI reads the run folder (`readRunSnapshot`) to pick the decision kind: cause `gate: plan` or
  `planner-questions` -> `kind: plan`; any other gate -> `kind: recipe-gate` with that gate id.
  A run that is not `waiting` on a gate gets core `ReviewNotAllowedError` (`gate-not-awaited`),
  shown through the existing pt-BR domain message; the final review stays in the web.
- `decidedBy: cli` (the CLI actor already recorded on runs, platform gates and HyperFrames),
  `decidedAt` the CLI clock, `correlationId: null`.
- Notes: optional on approve, required on reject (the web requires a reason), 1 to 4000 chars.
- Rejected alternative: calling the api over HTTP. The CLI has no web session and every other run
  action (`run`, `pause`, `resume`, `stop`) already goes through core in-process.

## Scope
`tools/cli/src/commands/run-gate.command.ts` (new), `tools/cli/src/program/arguments.ts`,
`tools/cli/src/program/program.ts`, `tools/cli/src/commands/run.command.ts` (message), and the R1
change record notes. Tests wait for the paused super-dev coverage run (owner decision 2026-11-21).

## Checklist
- [x] Command and wiring (2026-11-21)
- [x] R1 change record: user checklist item, stale R1-19 and R1-21 notes, Human decisions row (2026-11-21)
- [ ] Final checks at the end of the product work (typecheck and lint skipped by the owner 2026-11-21)

## What was made
- `tools/cli/src/commands/run-gate.command.ts` (new): `runGateCommand` reads the run folder, finds the awaited gate, builds a C3 `plan` or `recipe-gate` decision (`decidedBy: cli`) and executes core `RecordGateDecisionCommand`; not waiting -> `ReviewNotAllowedError` `gate-not-awaited`.
- `tools/cli/src/program/arguments.ts`: `parseGateOptions` (notes 1-4000 chars, required on reject).
- `tools/cli/src/program/program.ts`: `studio approve <runId> [--notes]`, `studio reject <runId> --notes`.
- `tools/cli/src/commands/run.command.ts`: the queued message now names `studio approve` beside the web.
- Not compiled, no tests written (tests paused until the product work ends).

## Verification
[validation] pending — final-stage user approval required

## Human decisions
2026-11-21 | Ricardo Fagmer | C10 open item | approved | "Gate only, no review"
2026-11-21 | Ricardo Fagmer | final checks (`pnpm --filter @studio/cli typecheck`, `lint`) | deferred | "Skip for now"; pending until the end of the product work
