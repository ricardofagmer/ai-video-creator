---
domain: llm
risk: high
spec: docs/specs/0005-curator.md
security_review: pending
---

# Curator implementation (PRD AC 33, SPEC 0005)

## What
Implements the approved Curator topology (`docs/specs/0004-curator-agent-topology.md`, v2) through
the tickets of SPEC 0005: C5-01 contracts, C5-02 core data, C5-03 core agents, C5-04 watcher,
C5-05 api, C5-06 web, C5-07 CLI, then C5-FP at the final gate.

## Why
PRD section 8 step 3 and AC 33 (the Curator proposes a change); AC 35 (only the owner promotes).

Risk is high: new model spend, a new SQLite migration (authored only), and model-written text
entering the catalog as a draft. `security_review: pending` holds the PR boundary until the
final-gate review (`security-reviewer` and `critic`).

## Process
- No git (the folder is not a repository): in-place workers, exclusive file scopes, the supervisor
  integrates each return by inspection, the closing code review runs over the changed files.
- No installs, builds, checks, migrations, live provider calls or network until the final
  checkpoint and the owner's explicit approval.

## Ticket ledger
| Ticket | Scope | Depends on | State |
|---|---|---|---|
| C5-01 | `packages/shared/**`, `docs/RUN-FORMAT.md` | none | integrated (DEGRADED: not compiled) |
| C5-02 | `packages/core/prisma/**`, `packages/core/src/{curation,costs,paths}/**`, `packages/core/package.json` | C5-01 | integrated (DEGRADED: not compiled; Prisma client not generated) |
| C5-03 | `packages/core/src/agents/**` | C5-01 | integrated (DEGRADED: not compiled) |
| C5-04 | `apps/watcher/**` | C5-01, C5-02, C5-03 | integrated (DEGRADED: not compiled) |
| C5-05 | `apps/api/**` | C5-01, C5-02 | integrated (DEGRADED: not compiled) |
| C5-06 | `apps/web/**` | C5-01 | integrated (DEGRADED: not compiled; needs C5-05 at run time) |
| C5-07 | `tools/cli/**` | C5-01, C5-02 | integrated (DEGRADED: not compiled) |
| C5-FP | test and eval files only | all integrated, owner approval | final gate |

## Integration notes
- C5-01 (2026-11-19): supervisor inspection: `ModelRoleNameSchema` unchanged, new objects `.strict()`,
  packet matches T§5, provenance `curator`, exports `./curation` and `./curation/files` (node only).
  Deviations accepted: second subpath `./curation/files` keeps `node:fs` out of the web bundle;
  `ListCurationsQuerySchema` follows `ListComparisonsQuerySchema` (spec 4.4 `PageLimitQuerySchema.extend`
  is not possible); never-sees lists live in packet doc comments; `end.usage` nullable; events carry
  `at` and `curationId`. Handed on: writer/director packet builders pass `learnings` (C5-03);
  `AssetVersionDetails.tsx:16` needs a `curator` provenance case (C5-06); executors pass
  `stageBrief.learnings` (C5-04); api error mapping uses `apiRev4ErrorReasons` (C5-05).
- C5-03 (2026-11-19): supervisor inspection: `tools: {}` only in `buildCurator`
  (`adapters/mastra-agent.factory.ts:79`); curator files import only `@studio/shared` ports and
  file helpers (no core `costs/` or `curation/` import); logger lines carry ids, counts and usd
  only; `LEARNING_NOTES_GUARD_LINE` (`prompts/prompt-common.ts:50`) matches T§8 exactly.
  Deviations accepted: live answer wrapped as `{answer: CuratorOutput}` for the JSON tool and
  unwrapped before the strict parse; 64-entry slice in `packetLearnings`; correction text also on
  the session prompt line; attempt 2 requires a correction (else `invalid-request`). Risks carried:
  Mastra system-array instructions and single-step structured output unconfirmed (L13); live
  Curator calls write no egress record (EgressLog is per run). Handed on to C5-04: register
  `CuratorAgentModule` with `CurationCostLedger` and `CostLedgerService` pricing; pass only the
  300 s curation signal plus stop; executors pass `learnings: stageBrief.learnings ?? []`.
- C5-06 (2026-11-19): supervisor inspection: no `dangerouslySetInnerHTML` and no
  `@studio/shared/curation/files` import in `apps/web/src`; no promote control on the curation
  feature or page (the only `'active'` literal is a recipe list filter in `curations.server.ts:50`);
  the request sends `acceptedWorstCaseUsd = curationBounds.maxUsd` only when the consent box is
  checked. Deviations accepted: a separate `CurationCompareForm` built from the existing comparison
  parts instead of editing `ComparisonForm`; button text "Pedir proposta ao curador" (spec 5.9
  casing); a failed list read shows a warning inside the card. Out of scope noted: no
  `/curadorias` index page or nav entry (not asked for).
- C5-02 (2026-11-19): supervisor inspection: migration `20261118180000_curator` is additive
  (`CREATE TABLE curation_decisions` with CHECKs, one index, `ALTER TABLE cost_entries ADD COLUMN
  source_kind ... DEFAULT 'run'`), sorts after the R2 migration, not executed; the only `'active'`
  literal under `curation/` and `costs/` is a read (`curation-catalog.reader.ts:60`); the skill
  draft folder is a `mkdtemp` folder removed after import. B8 confirmed in code: `RecipeVersion`
  has no quality or notes column. Deviations accepted: recipe body is canonical JSON indented by 2
  spaces for a readable diff; a skill body is its entry file and save-draft re-imports a rebuilt
  folder (reference skills become stored); unreadable or hash-mismatched bodies are refused as
  `curation-subject-not-curatable`; `bindings-resolvable` runs only after `recipe-json-valid`
  passes; a curation cost row uses `step_key = curation:call:<attempt>`. Risks carried: the Prisma
  client lacks `CurationDecision` and `sourceKind` until `prisma generate` (final gate); in-process
  locks guard one api process only. Handed on: C5-05 maps `MonthSpendUnavailableError`,
  `InvalidCurationInputError`, `CurationFileCorruptError` and dispatches `IndexCurationCostCommand`
  on terminal read and decision; C5-04 wires `CurationReadModule`, `CostsReadModule`,
  `CostLedgerService` and passes the agents `OutputScanner` into `runGroundCheck`; C5-07 calls
  `IndexCurationCostCommand`.
- C5-07 (2026-11-19): supervisor inspection: `tools/cli/src/curations/` has no write or append
  call (reads via `listCurationIds` and `readCurationState`; cost indexing only through
  `IndexCurationCostCommand`, one curation at a time); the status line prints counts only
  (`commands/status.command.ts:39`). Deviation accepted: the line shows in list mode only, not in
  `studio status <runId>`. Process note for retro: the PreToolUse hook routed these CLI writes to
  the llm intent because of the word "curation"; the worker kept the backend rules.
- C5-05 (2026-11-19): supervisor inspection: no `@studio/core/agents` import, no `'active'` and
  no `console.` in `apps/api/src/curations` or `platform/error-mapping.ts`; `decidedBy` from the
  session principal and `correlationId` from the request context
  (`curations.controller.ts:85-95`, `CorrelationIdMissingError` when absent); the only log line
  carries the curation id and an error name. Routes: GET /curations 200; POST /curations 201;
  GET /curations/:curationId 200; POST /curations/:curationId/decision 200; refusals per spec 4.4,
  plus `month-spend-unavailable` 503, `invalid-curation-input` 422 with issues,
  `curation-file-corrupt` 500 fixed text. Deviations accepted: the response assembler passes core
  views through (core validates them) and only adds terminal cost indexing (awaited; a failure is
  logged and does not fail the request); `POST /curations` carries no requester (core input has
  none). Residual: `InvalidCurationInputError` issue messages reach the client, as the other
  `Invalid*Input` errors already do.
- C5-04 (2026-11-19): supervisor inspection: no `prisma.` and no command bus under
  `apps/watcher/src/curation`; `requested` is only read; log lines carry ids, attempt, a failure
  kind, status and error names. Deviations accepted: the sweep fails every `collecting` file at
  start (wider than "claim.pid is not this process"; Q7); `call.started` is appended after the
  call returns with the start time; the no-change reason is redacted before it is written.
  Deviation to fix in the review pass: `curator-output.scan.ts` duplicates the agents
  `OutputScanner` because core does not export it. Risks carried: claim is write-then-reread
  (safe with one daemon per data home, as for runs); event appends are best-effort. Handed on to
  C5-FP: existing watcher tests that build `DaemonLoop` by hand need a `CurationStep`.

## Checklist
- [x] SPEC 0005 written (fable worker) and read by the supervisor
- [x] Open questions Q1 to Q7 answered by the owner
- [x] C5-01 to C5-07 integrated (all DEGRADED: not compiled)
- [x] Code review over the 143 changed files (3 read-only reviewers, 2026-11-19): 0 high, 1 medium
  (RC-1 interrupted live call records no cost), 16 low (RC-2..4, RA-1..8, RW-1..4), plus the
  core ground-check finding from the apps reviewer (a missing cited run id fails non-fixable
  checks, so the T§7 corrective call never happens) and the `OutputScanner` export gap. Tables:
  scratchpad `review-core.md`, `review-apps.md`, `review-web.md`.
- [x] One fix pass for every review finding (2026-11-19): RC-1..4, RA-1..8, RW-1..4, the core
  ground-check item and the `OutputScanner` export all fixed (DEGRADED: not compiled). Supervisor
  inspection: `curator-output.scan.ts` deleted, `OutputScanner` exported
  (`packages/core/src/agents/index.ts:15`), one watcher `errorName` (`platform/error-name.ts`),
  `agents.service.ts` at 300 lines. RC-1: an interrupted live call records a worst-case cost row
  (`curator-cost.recorder.ts`); `worstCaseInputChars` moved to `@studio/core/agents`. RW-3: dead
  refresh branch removed. Additive core API: `GroundCheckResult` failure gains `skippedChecks`.
- [ ] Final checks (lint, typecheck, build, tests, the 24 evals), `security-reviewer` and `critic`:
  deferred to release. Kernel checkpoint 2026-11-19: `checks: skip`, `security: skip`,
  `offers: skip`, reasons `not-release`; security_reasons `risk:high`,
  `security-path:apps/watcher/src/curation/curation-spend.guard.ts`.
  Marker: `[validation] deferred to release — not a release (143 files, risk high)`.
  `security_review: pending` stays so the PR boundary holds the review.

## Open items
- Estimated cost rows (RC-1) carry no flag in `cost.json`; they are told apart by `usage: null`
  on the session end line and the `curator.cost-estimated` log line. An optional `estimated`
  field on the shared cost schema is a possible later contract change.
- Closed 2026-11-19: `heartbeat-writer.ts` now imports `errorName` from `apps/watcher/src/platform/error-name.ts`; no watcher copy remains. Copies in api, core and cli predate SPEC 0005 and stay out of scope.
- Closed 2026-11-19: `studio doctor` has a file-only `curadorias` check (`tools/cli/src/doctor/curation-checks.ts`) that lists by id curations ended `failed` with 0 model calls in the last 7 days (parked requests, restart sweeps, faults before the first call) and unreadable folders, as a warning; `studio status` prints a count warning pointing to doctor. Ids and counts only. Not compiled.
- Nothing from R1, R2 or SPEC 0005 has been compiled. Dependencies installed 2026-11-19 (`pnpm install`, 620 packages, pnpm-lock.yaml created, unfrozen); typecheck and build declined for now ("Not now").
- Pin `pnpm.overrides` `@posthog/core: 1.69.1` in the root package.json (1.69.2 tarball 404 minutes after publish); remove once a newer release has aged.
- Install warnings: `tools/cli` ink 6.8.0 > react-reconciler 0.33.0 wants react ^19.2.0, found 19.1.0 (unmet peer); `apps/watcher` `ace` bin not linked until `packages/toolbox` is built.
- Vetting 0001 phase 2 check 3 done 2026-11-19: onnxruntime-node 1.31.1 ships `bin/napi-v6/darwin/arm64` (dylib + binding); `script/install.js` requirements list nothing for darwin/arm64 (only linux/x64 cuda12 from the NuGet feed); postinstall stays blocked and is the only ignored build script.
- Migrations `20261118120000_r2_improvement_loop` and `20261118180000_curator`: authored, not
  executed; execution needs the owner's scoped confirmation.
- [ ] Migration `20261118180000_curator` execution: owner's scoped confirmation (not before the R2 migration)

## Human decisions
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q1 cost ledger: "Add source_kind column (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q2 consent: "Explicit $1.00 field (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q3 corrective packet: "Inputs identical (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q6 role enum: "No, own service (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q4 month ceiling: "Default $60 for all (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q5 review excerpts: "Owner notes only (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | SPEC 0005 Q7 resume: "No, it ends failed (Recommended)" | approved | docs/specs/0005-curator.md section 15
2026-11-19 | Ricardo Fagmer | wave 2 timing: "Start when C5-01 returns (Recommended)"; C5-02 and C5-03 launch together after C5-01 is inspected and integrated | approved | this record
2026-11-19 | Ricardo Fagmer | next step: "Install and compile (Recommended)"; then `pnpm install`: "Run pnpm install (Recommended)" (one run, pnpm 10.12.1, Node 24.21.0, registry.npmjs.org, unfrozen: creates pnpm-lock.yaml; allowlisted scripts only; onnxruntime-node postinstall stays blocked). Typecheck and build are asked separately | approved | this record
2026-11-19 | Ricardo Fagmer | first `pnpm install` failed (ERR_PNPM_FETCH_404 on @posthog/core 1.69.2, published 12:30Z, 3 minutes before; via @mastra/core > posthog-node); fix: "Pin 1.69.1, retry (Recommended)": root package.json `pnpm.overrides` `@posthog/core: 1.69.1`, one more `pnpm install` with the same scope; remove the pin once a newer release has aged | approved | this record
2026-11-19 | Ricardo Fagmer | typecheck `TURBO_TELEMETRY_DISABLED=1 pnpm typecheck --continue`: "Not now"; stays pending until reopened | declined | this record
