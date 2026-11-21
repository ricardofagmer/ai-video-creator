# Run format — `format: 1`

Status: frozen contract C3/C4 of SPEC 0002 (ticket R1-02), 2026-11-18; amended by SPEC 0002 rev 3
the same day (`egress.jsonl`, models in the stage input manifest, plan-gate rejection by the
watcher). Every rev 3 addition is optional for readers and keeps `format: 1`.
Executable form: the zod schemas in `packages/shared` (`@studio/shared/run-format`), written and
read only through `@studio/shared/run-files` (C5). When this document and the schemas disagree,
the disagreement is a defect: fix both in one change, through the R1-02 owner (SPEC 0002 section 4).

Sources: ADR 0003 (decisions 3-5, "Who writes what"), PRD 0001 sections 5.2, 7 and 13, topology
spec 0001 sections 5, 7, 9 and 10, SPEC 0002 assumptions A5-A7 and conflicts K2, K3, K5. The
reference design is eng-grafo `tools/FORMATO.md`.

## 1. Layout

A run lives in `~/Library/Application Support/VideoStudio/runs/<runId>/` (D5). A run folder is
not a git repository; content hashes give the audit trail (ADR 0003 decision 4).

```text
runs/<runId>/
  run.json                 source of truth: state, recipe, brief, limits, stages, cursor, totals
  plan.md                  export of run.json for people; never read back as state
  now.json                 live snapshot (at most about 4 writes per second)
  events.jsonl             append-only event log
  egress.jsonl             append-only "what left the machine" log, one line per external call
  control.json             request channel api/CLI -> watcher (pause, stop, resume)
  approval.json            human gate decisions (plan, recipe gates, final)
  watcher.pid              `<pid> <bootTimeMs>` stamp of the watcher executing the run
  sessions/<sessionId>.jsonl        redacted agent session streams
  checks/<NN>-<stageId>/<checkId>-<attempt>.json   check results (+ .log raw output)
  stages/<NN>-<stageId>/   working folder: brief.json, input-manifest.json, declared outputs
  archive/<NN>-<stageId>/  per-stage archive written by the `archive` step
  final.mp4                the video
  manifest.json            every pinned version, parameters, models, outputs, egress
  cost.json                billed sessions and the run total
  qa/                      summary.json, media-review.json, review-<subject>.json
  report.md                what was made, decisions, what left the machine, what to listen for
  publications.jsonl       append-only, after approval: studio uploads to platforms (section 25)
```

`<NN>` is the stage number with two digits; stages are numbered 1..N continuously across phases.

## 2. Conventions

- Every file is UTF-8. JSON files are indented with 2 spaces and end with a newline.
- Every whole-file write goes through the atomic helper: write `<file>.tmp-<pid>`, flush, rename
  over the target. A reader sees the old or the new file, never a mix. Files are created with mode
  `0600`. No other write path exists (ADR 0003, "We commit to maintain").
- `events.jsonl`, `egress.jsonl` and `sessions/*.jsonl` are append-only: one JSON object per
  line, never rewritten. A reader consumes complete lines only and keeps the byte offset after the last
  newline; bytes after it belong to an append in progress and are read on the next poll.
- Times: ISO-8601 instants (`2026-11-18T14:03:12.511Z`) in `run.json`, `approval.json`,
  `manifest.json`, `egress.jsonl`, `cost.json`, `qa/` and stage files; Unix epoch milliseconds
  in the high-frequency files `now.json`, `events.jsonl`, `control.json` and session streams
  (fields ending in `Ms`). Durations are milliseconds; money is US dollars as a number.
- Every object is strict: a field not in the schema fails validation, both on write and on read.
- Owner-facing text (`reason`, `whatToDo`, gate labels, report and plan) is pt-BR (D16);
  identifiers and enum values are English.
- Nothing in a run folder holds an API key, a passphrase or the content of a biometric asset.
  Secret patterns become `<redacted>` and biometric paths `<biometric-ref>` before any write
  (criterion 21, topology section 8).

## 3. Format version

`run.json`, `manifest.json` and `cost.json` carry `"format": 1`. Adding an optional field keeps
the number. Renaming or removing a field, or changing its meaning, bumps it. A reader that meets a
number higher than it supports refuses the run with `UnsupportedRunFormatError` (code
`unsupported-format`, it names the file and both numbers) instead of guessing (ADR 0003 decision 5).
The check runs on every JSON file read through `run-files`, before schema validation.

The SPEC 0002 A6 amendments (gate decisions in `approval.json`, the `resume` flag in
`control.json`) are optional additions and keep `format: 1`.

The SPEC 0002 rev 3 amendments keep `format: 1` as well: `egress.jsonl` is an additional file
(a reader of an older run treats a missing `egress.jsonl` as empty), and the egress `measure`
field is optional (a manifest written before rev 3 still validates; every rev 3 writer sets it).

The SPEC 0007 amendments keep `format: 1` too: `publications.jsonl` is an additional, optional file
(a reader of an older run treats a missing `publications.jsonl` as empty), and the files under
`<data home>/platform/` (section 26) carry their own `"format": 1`.

## 4. Who writes what

| File or store | Writer | Rule |
|---|---|---|
| `run.json` (draft, `pending`) | api (for the web) or CLI | Created before any watcher runs; only `draft` -> `pending` |
| `run.json`, `plan.md`, `now.json`, `events.jsonl`, `watcher.pid`, `sessions/`, `checks/`, `stages/`, `archive/`, outputs (`final.mp4`, `manifest.json`, `cost.json`, `qa/`, `report.md`) | Watcher | Sole writer while its `watcher.pid` is alive |
| `control.json` | api or CLI | Request channel `{ pause, stop, at }`; the watcher reads it between steps and deletes only the request it read |
| `approval.json` + `run.json` status `review` -> `approved` / `rejected` | api or CLI | Only at `review` with no live watcher; the same outcome is written to SQLite |
| `run.json` status `running` -> `rejected` at the plan gate | Watcher | Amended 2026-11-18 (SPEC 0002 rev 3, ADR 0003): the watcher holds the run at the plan gate, so it applies the owner's `rejected` plan decision read from `approval.json` and ends the run |
| `egress.jsonl` | Watcher | Amended 2026-11-18 (SPEC 0002 rev 3, ADR 0003): append-only, one line per external call, written through the C5 helper; `package` copies it into `manifest.json.egress` |
| `approval.json` gate decisions (`plan`, recipe gates, `final`) and the optional `resume` flag in `control.json` | api or CLI | SPEC 0002 A6, K2: optional fields, `format: 1` unchanged; written only while no watcher step is in progress |
| `run.json` created at `pending` with `createdBy: 'watcher'` and `schedule` | Watcher | Amended 2026-11-19 (SPEC 0006 sections 4.6 and 5.6, ADR 0003): only from a due slot of an `active` schedule, only when no run is startable; one write through the C5 helper, then the ordinary rules apply (the run waits at its gates and ends its watcher life at `review`) |
| `schedules/<id>/schedule.json` | api or CLI | Amended 2026-11-19 (SPEC 0006): atomic rewrite; `deleted` is a status, the folder is never removed by code (section 24) |
| `schedules/<id>/cursor.json`, `slots.jsonl` | Watcher | Amended 2026-11-19 (SPEC 0006): written only between runs, under `fire.lock`; `slots.jsonl` is append-only (section 24) |
| `schedules/<id>/fire.lock`, `fire.lock.takeover` | Watcher | Amended 2026-11-19 (SPEC 0006 section 4.6, R3 security review L1 and M1): O_EXCL create holding the owner's pid, held for one evaluation of one schedule, removed only by its owner; a stale lock is replaced only under `fire.lock.takeover` |
| `schedules/<id>/fired/<slotMs>` | Watcher | Amended 2026-11-19 (SPEC 0006 section 4.6, R3 security re-review 2): O_EXCL claim holding the claimant's pid, created before the slot's run is written; removed only by its claimant after its own run write failed |
| SQLite (catalog, recipes, outcomes, run index) | Nest command handlers, run by the api or by the CLI booting the same modules | The watcher only reads it; the run index is rebuilt from run folders and the files win |
| SQLite `run_publications`, `platform_metric_snapshots`, `metric_imports`, quality columns | Nest command handlers (api or CLI) | Amended 2026-11-19 (SPEC 0006 K1): the watcher does not write them. Amended 2026-11-20 (SPEC 0007 L2): the watcher reads `run_publications` and `run_outcomes` to list its poll targets |
| Keychain items of service `com.videostudio.platform-tokens` | api or CLI (create at connect, delete at disconnect); watcher (replace on refresh) | Amended 2026-11-20 (SPEC 0007 sections 4.6 and 5.2): every write and delete holds `platform/accounts/<platform>/token.lock`; no token value is ever written to a file, SQLite, a run file, a log or an event (K3) |
| `platform/gates.json`, `platform/accounts/<p>/account.json`, `platform/publish/<id>/request.json`, `platform/publish/<id>/cancel` | api or CLI | Amended 2026-11-20 (SPEC 0007 section 4.6): `request.json` is written once, only by `RequestPublish`, and never edited; `cancel` is an O_EXCL marker created only while no `claim` exists (section 26) |
| `platform/accounts/<p>/health.json`, `platform/publish/<id>/claim`, `platform/publish/<id>/state.json`, `platform/polls/cursor.json` | Watcher | Amended 2026-11-20 (SPEC 0007 section 4.6): written only between runs; `claim` is an O_EXCL file holding the claimant's pid and is never removed (section 26) |
| `platform/accounts/<p>/token.lock` | api, CLI or watcher | Amended 2026-11-20 (SPEC 0007 section 5.2): O_EXCL holding the owner's pid, held for one Keychain write or delete; stale after 60 s and removed by its finder (section 26) |
| `platform/metrics-inbox/<batchId>.json` | Watcher creates (temp file, then link); `IngestMetricBatch` (api or CLI) deletes after its transaction commits | Amended 2026-11-20 (SPEC 0007 K2): the one stated exception to one writer per file, like `control.json`; never edited (section 26) |
| `runs/<runId>/publications.jsonl` | Watcher | Amended 2026-11-20 (SPEC 0007 sections 4.3 and 5.4): append-only; only for a run whose status is `approved`; no other run-folder file is touched after approval (section 25) |
| SQLite `publication_attempts`, `run_publications.origin`, `attempt_id`, `platform_media_id`, `metric_imports.origin` | Nest command handlers (api or CLI) | Amended 2026-11-20 (SPEC 0007 section 4.5, K1): the watcher writes no table |
| `hyperframes/engine.json`, `hyperframes/chrome.json`, `hyperframes/trace.json`, `hyperframes/config/` | CLI | Amended 2026-11-20 (SPEC 0008 section 4.5): `engine.json` only by `studio hyperframes enable` / `disable`, `chrome.json` only by `chrome install`, `trace.json` only by `trace`, `config/config.json` seeded once before any HyperFrames process starts; the watcher reads them and writes nothing there (section 27) |
| `hyperframes/cache/` | The pinned HyperFrames process | Amended 2026-11-20 (SPEC 0008 sections 4.5 and 5.5): Chrome lives here, filled only by the owner-confirmed `chrome install`; no studio code writes inside it, `home/` stays empty (section 27) |
| Mastra storage | None | Agents keep no state of their own (D18) |

## 5. Ids

| Id | Shape | Rule |
|---|---|---|
| `runId` | ULID, 26 Crockford base32 characters | Created by the api or CLI with the draft; it is the folder name |
| `stepKey` | `stageId:step:attempt`, e.g. `script:execute:2` | Attempt counts from 1 |
| `sessionId` | ULID | One per agent call; it is the packet id; names `sessions/<sessionId>.jsonl` |
| `correlationId` | 1-128 characters of `[A-Za-z0-9._:-]` | The api's `x-request-id`, copied into the draft `run.json` and into `control.json` requests; null from the CLI |
| `assetId@version` | `/^[a-z0-9-]+@\d+$/` | Every pinned asset; with its `contentHash` (lowercase hex sha-256) |
| `recipeId@version` | same shape | The recipe version a run uses (SPEC 0002 A10) |

## 6. Vocabulary

**Phases** (PRD 7.1): `pre-production`, `production`, `post`, `delivery`.

**Stages** in canonical order (SPEC 0002 A5), with their phase:

| # | `stageId` | Phase | Executor |
|---|---|---|---|
| 1 | `plan` | pre-production | Planner (fallback: recipe default plan), then the plan gate |
| 2 | `research` | pre-production | toolbox, deterministic: capture `sourceUrl`, extract page text |
| 3 | `verify` | pre-production | toolbox, deterministic: each key message becomes a claim with evidence |
| 4 | `script` | pre-production | Scriptwriter + Reviewer loop |
| 5 | `capture` | production | Playwright or mock |
| 6 | `scenes` | production | Scene director + Reviewer loop |
| 7 | `narration` | production | mock, ElevenLabs or the local voice |
| 8 | `composition` | post | `@ace/video` (Remotion) |
| 9 | `captions` | post | toolbox caption burn |
| 10 | `fades` | post | toolbox fades |
| 11 | `music` | post | toolbox music with ducking |
| 12 | `qa` | delivery | toolbox media review as `verify` checks |
| 13 | `agent-review` | delivery | Reviewer on the render, evidence only |
| 14 | `package` | delivery | assembles `final.mp4`, `manifest.json`, `cost.json`, `qa/`, `report.md` |

`plan` replaces the PRD's "brief" stage so it never collides with the step `brief`. The stage
`verify` and the step `verify` are separate enums. `package` runs before the run enters `review`;
approval only records the decision (K5). A recipe may switch stages off, except `plan`, `qa` and
`package`.

**Steps**, the same seven in every stage, in this order (PRD 7.2):

| # | Step | Does | Postcondition, decided by the engine |
|---|---|---|---|
| 1 | `brief` | Renders `stages/<NN>-<stageId>/brief.json` from a template, no model call (K1) | The file exists and validates |
| 2 | `preflight` | Re-hashes every bound asset; checks provider modes and credentials; estimates cost | Every asset resolves with a matching hash; estimate under `limits.costPerRunUsd`; month-to-date spend plus estimate under `limits.costPerMonthUsd` |
| 3 | `snapshot` | Writes `stages/<NN>-<stageId>/input-manifest.json` | The file exists and validates |
| 4 | `execute` | Runs the executor; the next stage's brief renders in parallel | Every required declared output exists as a non-empty regular file; an optional one (rev 4) may be absent, but when present it must be a non-empty regular file |
| 5 | `verify` | Runs the stage checks; on failure repeats once, then one Recovery call (K3) | Every check passed |
| 6 | `archive` | Moves the brief, input manifest and evidence to `archive/<NN>-<stageId>/` | The archive folder exists |
| 7 | `record` | Hashes outputs into `run.json` (optional outputs only when they exist); marks the stage delivered | none |

**Step status**: `pending`, `running`, `ok`, `warning` (succeeded after recovery or with a
caveat), `failed`, `skipped`. A step whose postcondition is not met is never `ok`, whatever the
executor or agent reported (criterion 11).

**Optional declared outputs** (SPEC 0002 rev 4, section 13.6, A30): a declared output may carry
`optional: true`. Absent or `false` means required, so every brief written before rev 4 validates
and means the same, and `format: 1` is kept. An optional output that is absent passes the
`execute` postcondition; one that is present must be a non-empty regular file, like a required
one. Optional never weakens a required output, and an executor cannot mark an output optional at
run time: the list is fixed in the stage brief at step `brief`, before `execute`. The `package`
stage declares the Reviewer verdict copies `qa/review-script.json`, `qa/review-scenes.json` and
`qa/review-render.json` as optional; a degraded review writes no verdict file and still surfaces
as a warning in `qa/summary.json`.

**Run status** (PRD 7.2): `draft` -> `pending` -> `running` -> `waiting` / `paused` / `failed` /
`interrupted` -> ... -> `review` -> `approved` / `rejected`. The watcher also writes `running` ->
`rejected` when the owner rejects the plan (or a recipe gate) at that gate (rev 3, section 4).

| Status | Meaning | Extra fields in `state` |
|---|---|---|
| `draft` | Created by the api or CLI; not started | `since` |
| `pending` | Waiting for the watcher | `since` |
| `running` | A watcher executes it; shown only while that pid is alive, otherwise shown as `interrupted` without writing | `since`, `pid` |
| `waiting` | Needs a person: a gate, an auth error, a ceiling, a never-retried condition | `since`, `cause`, `reason`, `whatToDo` |
| `paused` | Paused through `control.json` after the current step | `since` |
| `failed` | Attempts exhausted | `since`, `reason`, `stepKey` |
| `interrupted` | Stopped by a person, or found with a dead watcher | `since`, `reason` |
| `review` | Outputs packaged; the final gate is open | `since` |
| `approved` / `rejected` | Human decision recorded | `since`, `decidedBy`; `rejected` adds `gate` |

`waiting`, `paused`, `failed` and `interrupted` resume from `cursor`, the exact step.

**Waiting causes** (`state.cause.kind`): `gate` (with `gate`), `authentication` (with
`provider`), `cost-ceiling` (`ceiling: run | month`, `estimateUsd`, `limitUsd`), `license-doubt`
(`ref`), `claim-without-evidence` (`claimIds`), `biometric-asset` (`ref`), `needs-person`
(`stepKey`, Recovery asked for a person), `planner-questions` (`questions`),
`revisions-exhausted` (`stageId`, `issues`), `agent-failed` (`role`, `stepKey`). License doubts,
claims without evidence, biometric assets and cost ceilings are never retried automatically; an
authentication error goes straight to `waiting` with no Recovery call (PRD 7.3).

**Checks** (`checkId`): `output-schema`, `refs-resolve`, `claims-evidence`, `container`,
`codec`, `resolution`, `fps`, `duration`, `loudness`, `true-peak`, `audio-present`,
`black-frames`, `caption-timing`, `reviewer-score`, `outputs-present`.

**Gates**: `plan` and `final` always exist; a recipe adds kebab-case gates after a stage.

**Providers**: `claude`, `elevenlabs`, `local-voice`, `capture`, `render`.

**Session outcomes** (topology section 10): `ok`, `schema-retry`, `rate-limited`, `failed`, `fallback`.

**Model roles** are the C7 role names (`planner`, `writer`, `director`, `evaluator`, `recovery`);
the run format checks only their shape.

## 7. Limits

`run.json.limits` holds the full resolved set: defaults, then the recipe's `limits` overrides.

| Field | Default | Source |
|---|---|---|
| `attemptsPerStep` | 3 | Topology section 7 |
| `recoveriesPerStage` | 4 | SPEC 0002 A7 (one Recovery call per failed step attempt on top, K3) |
| `revisionsPerStage` | 2 | Topology section 7 evaluator loop (3 attempts) |
| `commandTimeoutMs` | 900000 (15 min) | SPEC 0002 A7; a recipe stage may set its own `timeoutMs` |
| `costPerRunUsd` | 3 | D11 |
| `costPerMonthUsd` | 60 | D11 |

Per-agent bounds (`maxSteps`, tool calls, `maxTokens`, `maxUsd`, timeout) are the topology
section 7 table, owned by the agent protocol (C7), not by `limits`.

## 8. `run.json`

| Field | Type | Notes |
|---|---|---|
| `format` | `1` | Section 3 |
| `runId` | ULID | Equals the folder name |
| `title` | string <= 200 | |
| `createdAt`, `updatedAt` | ISO instant | |
| `createdBy` | `api` \| `cli` \| `watcher` | Writer of the draft; `watcher` (SPEC 0006, L2) for a run the watcher created at `pending` from a schedule slot. Additive: `format` stays `1` and every earlier run folder still validates |
| `correlationId` | id \| null | Section 5 |
| `state` | object | Run status with its extra fields (section 6) |
| `recipe` | `{ ref, contentHash, definition }` | The recipe version, frozen in the run; `contentHash` is the sha-256 of the canonical JSON (keys sorted, no whitespace) of `definition` without its lifecycle fields `status`, `createdAt` and `updatedAt` (SPEC 0002 rev 2: the definition only, so a status change never changes the hash; C2 `recipeContentHashInput`); `ref` equals `definition.id@definition.version` |
| `brief` | Brief | `topic`, `sourceUrl?` (http/https), `keyMessages[]` (<= 10), `format` (`16:9` \| `9:16` \| `1:1`), `language` (`pt-BR` \| `en-US`), `targetDurationSec` |
| `references` | `assetId@version[]` | Run-specific references attached with the brief |
| `limits` | Limits | Section 7 |
| `plan` | object \| null | `source` (`planner` \| `recipe-default`), `totalEstimateUsd`, `risks[]`, `questionsForOwner[]`, `warning` (pt-BR, when the default plan replaced the Planner), `recordedAt` |
| `stages` | StageRecord[] | Numbered 1..N without gaps |
| `cursor` | object \| null | `{ stageNumber, stageId, step, attempt }`: where execution continues; null before the first step and after the last stage |
| `totals` | object | `durationMs`, `costUsd`, `costByProvider { claude, tts, render }`, `executions`, `stagesDelivered`, `sessions`, `checksRun`, `recoveries`, `recoveriesResolved`, `failures` |
| `lastExecution` | object \| null | `{ pid, startedAt, endedAt, outcome }` of the latest watcher execution; `outcome` is the status it ended in, null while running |
| `comparison` | RunComparisonLink, optional | SPEC 0003 (R2): present only on the two arms of an A/B comparison; absent on every ordinary run, so `format` stays `1` and every earlier run folder still validates. See **RunComparisonLink** below |
| `schedule` | RunScheduleLink, optional | SPEC 0006 (R3): present exactly when `createdBy` is `watcher`; absent on every other run, so `format` stays `1`. See **RunScheduleLink** below |

**RunComparisonLink** (SPEC 0003 section 5.3; `run-format/comparison.ts`): `comparisonId`
(ULID), `arm` (`a` \| `b`), `peerRunId` (the other arm), `subject`, `briefHash` (sha-256 of the
canonical JSON of the brief, equal on both arms), `learningsCutoff` (ISO instant: the comparison's
creation time; both arms render their stage briefs with the learning notes that existed then,
section 17), `costConsent` (`{ worstCaseUsd, acceptedBy, acceptedAt }` or null). `subject` is
`{ kind: 'asset-binding', slot, a: assetId@version, b: assetId@version }` (two versions of one
asset; arm B runs a `draft` variant recipe version whose only differences are `version`,
`provenance` `{ type: 'comparison', comparisonId }` and the binding in `slot`) or
`{ kind: 'recipe-version', a: recipeId@version, b: recipeId@version }` (two versions of one
recipe); `a` and `b` differ and name the same asset or recipe id. Writer: the api, when it creates
the two drafts (with `costConsent: null`) and when `POST /comparisons/:comparisonId/start` accepts
the pair's worst case (it writes `costConsent` into both files, then moves both runs to `pending`,
arm A first). The watcher never writes it and reads only `learningsCutoff`. Files win: the run
index rebuild restores the comparison from the two links.

**RunScheduleLink** (SPEC 0006 section 4.3; `run-format/schedule-link.ts`): `scheduleId` (ULID,
the folder name under `schedules/`), `slotAt` (ISO instant of the slot that fired), `briefId` (ULID
of the queue brief the run uses). Writer: the watcher, once, in the single write that creates the
run at `pending` (section 24). Nothing rewrites it. Rule: present exactly when `createdBy` is
`watcher`. Before firing a slot the watcher looks for a `run.json` with the same `scheduleId` and
`slotAt`, so a crash between the run write and the slot line never creates a second run.

**StageRecord**: `number`, `stageId`, `phaseId` (must match the stage), `outcome`
(`pending`; `delivered` with `deliveredAt` and `summary`; `skipped` with `reason`
`disabled-by-recipe` \| `disabled-by-plan`), `steps` (exactly the seven steps in order,
criterion 10), `outputs[]` (`name`, `path`, `contentHash`, `sizeBytes`, `recordedAt`),
`estimate` (`tokens`, `ttsChars`, `renderSec`, `usd`) or null, `durationMs`, `costUsd`. A
delivered stage has every step `ok`, `warning` or `skipped`. Output names read by
`RunArtifactReadTool` are the C7 artifact ids (`script`, `scenes`, `captures-index`, ...).

**StepRecord**: `step`, `status`, `attempts`, `startedAt`, `endedAt`, `durationMs`, `costUsd`,
`detail` (<= 500), `recoveries[]`.

**RecoveryRecord**: `number`, `sessionId`, `attempt`, `error` (redacted), `cause`,
`whatWasDone`, `actionKind` (a C7 `RecoveryAction` kind the engine applied), `resolved`,
`needsPerson`, `costUsd`, `at`.

## 9. `plan.md` and `report.md`

Markdown for people, pt-BR, written by the watcher through the atomic helper and never read back
as state. The writer refuses a document that lacks a required `## ` heading.

- `plan.md` (export of `run.json` after the `plan` stage): `# Plano — <title>`, then
  `## Fases e etapas`, `## Versões fixadas`, `## Estimativa de custo`, `## Riscos`.
- `report.md` (output of `package`): `## O que foi feito`, `## Decisões`,
  `## O que saiu da máquina` (from `manifest.json.egress`), `## O que ouvir com atenção`, `## Avisos`.

## 10. `now.json`

Live snapshot, rewritten by the watcher on every event. Read by the api (for the web) and the CLI.

`runId`, `pid`, `updatedAtMs`, `stageNumber`, `stageId`, `step`, `attempt`, `stepSinceMs`,
`activities[]` (the last 50: `atMs`, `kind` `tool` \| `text` \| `command` \| `check`, `text`
redacted <= 500), `sessions[]` (finished sessions of the current stage: `sessionId`, `role`,
`modelId`, `step`, `attempt`, `startedAtMs`, `endedAtMs`, `outcome`, `costUsd`, `durationMs`),
`currentSession` (the same without the end fields) or null, `parallel` (e.g. the next stage's
brief in preparation) or null, `notice` (pt-BR) or null.

## 11. `events.jsonl`

One event per line. Common fields: `atMs`, `runId`, `level` (`info`, `ok`, `warning`, `error`,
`step`, `agent`, `command`, `output`), `text` (redacted <= 2000), `stepKey` or null,
`correlationId` or null, and `type`:

| `type` | Extra fields |
|---|---|
| `log` | none |
| `run.status` | `from` (status or null), `to` |
| `step.status` | `status` |
| `step.recovery` | `actionKind`, `resolved`, `needsPerson` |
| `check.result` | `checkId`, `outcome` (`passed` \| `failed` \| `error` \| `skipped`) |
| `session.started` | `sessionId`, `role`, `modelId` |
| `session.ended` | `sessionId`, `role`, `modelId`, `outcome`, `costUsd` |
| `review.verdict` | `subject` (`script` \| `scenes` \| `render`), `scores[]` (`criterionId`, `score` 1-5), `overall`, `retryRecommended` |
| `gate.waiting` | `gate` |
| `gate.answered` | `gate`, `outcome` (`approved` \| `rejected`) |
| `control.request` | `request` (`pause` \| `stop` \| `resume`) |

Only the watcher appends to `events.jsonl`. It records `control.request` when it reads
`control.json`, and `gate.answered` when it reads a decision from `approval.json` on resume.
Stage executors hand `session.started`, `session.ended` and `review.verdict` to the engine through
the C6 event sink (`StageExecutionContext.events`); the engine stamps `atMs`, `runId`,
`correlationId` and the current `stepKey` and appends them through C5.

## 12. `control.json`

`{ "pause": bool, "stop": bool, "at": epochMs, "resume"?: bool, "correlationId"?: id }`.

- `pause`: the watcher finishes the current step, writes `paused` and exits. Writing `pause:
  false` before it acts cancels the request.
- `stop`: the watcher aborts the current step (its `AbortSignal`), records the step as
  `pending`, writes `interrupted` with a reason and exits. `stop` wins over `pause`.
- `resume` (A6): written only while no watcher is alive, for a run in `waiting`, `paused`,
  `failed` or `interrupted`; the daemon picks the run up and continues from `cursor`.
- The watcher reads the file between steps and deletes only the request it read: it moves the
  file aside, compares it with that request, and links it back if a newer request arrived in
  between, so a pause or stop written meanwhile is never lost.

## 13. `approval.json`

`{ "runId", "decisions": [...] }`, written by the api or CLI only while no watcher step is in
progress. Each decision has `kind`, `outcome` (`approved` \| `rejected`), `decidedBy`,
`decidedAt`, `notes` (<= 4000), `correlationId` or null:

- `kind: "plan"`: the plan gate (topology section 12; K2).
- `kind: "recipe-gate"` with `gate`: a gate the recipe added.
- `kind: "final"` with `rating` (1-5) and `checklist[]` (`itemId`, `checked`): the review form
  (D14). A final approval with a required recipe checklist item unchecked is refused.

A gate may be answered again after the run returns to it; the decision with the latest
`decidedAt` for that gate is in force. Only the review handler moves `run.json` from `review` to
`approved` / `rejected`, and writes the same outcome to SQLite (criterion 17).

## 14. `watcher.pid`

The process stamp of the watcher executing the run: `<pid> <bootTimeMs>` and a newline, where
`bootTimeMs` is the epoch-ms boot instant of the machine (`Date.now() - os.uptime()`, written
through `formatProcessStamp`). The file is at most 64 bytes and must be a regular file; a link, a
non-regular file or other content is a schema error.

- **Claim.** On start a watcher reads the file with its own pid as `selfPid` and refuses the run
  when the owner is `alive`. Otherwise it creates the file exclusively (`O_EXCL`, `wx`) through
  `claimWatcherPid`. When the file is there and its owner is not alive, the stale file is removed
  (`removeStaleWatcherPid`, which re-reads it first and keeps a live owner's file) and the
  exclusive create is tried once more; losing that race refuses the run. A watcher never
  overwrites another process's file. Then it sets `running`, increments `totals.executions` and
  sets `lastExecution`.
- **Liveness** (`readWatcherState(runDir, { selfPid })`, `isStampAlive`). The owner is `alive`
  only when all three hold: the stamp's boot time matches this boot within
  `BOOT_TIME_TOLERANCE_MS` (60 s), the pid is not `selfPid`, and signal 0 to the pid succeeds.
  Signal 0 failing with `ESRCH` (no such process) or `EPERM` (a process of another user, which a
  watcher never is) means `dead`. A stamp from an earlier boot is `dead` without signalling: its
  pid may now belong to any process. A stamp naming the reader's own pid was left by an earlier
  life of that pid, so a `running` run it names crash-resumes (criterion 13). The api and CLI
  pass no `selfPid`.
- **Older bare-pid files.** A file holding only `<pid>` and a newline (written before the stamp)
  is still read. Its mtime stands in for the boot: a file written before this boot (mtime earlier
  than boot minus the tolerance) is `dead` without signalling; otherwise the same `selfPid` and
  signal-0 rules apply. Such a file is treated as stale only when it is provably dead; it is
  replaced by a stamp on the next claim. `readWatcherPid` still returns the pid of either form.
- **Release.** On exit the watcher records `lastExecution.endedAt` and `outcome` and removes the
  file only while it names its own pid (`releaseWatcherPid`); a file another watcher has since
  claimed stays.

### `<data home>/logs/watcher.lock`

One watcher daemon per data home. Before Nest starts, `main.ts` creates
`<data home>/logs/watcher.lock` exclusively (`wx`, mode `0600`) holding the same
`<pid> <bootTimeMs>` stamp. When the file exists:

- a holder that is `alive` by the rules above (same boot, not this pid, signal 0 succeeds) keeps
  it: the new daemon logs `watcher.already-running` with the holder's pid to stderr and exits 1;
- a holder of another boot, a holder whose pid answers `ESRCH`/`EPERM`, a stamp naming this pid,
  a link or a non-regular file is stale and is taken over. Takeover is serialized through
  `watcher.lock.takeover` (exclusive create) and replaces the file only if it is still the same
  inode that was judged stale;
- a file without a readable stamp (a holder that crashed between create and write) is stale once
  it predates this boot or is older than 10 s; younger, it counts as held.

On shutdown, and on the process `exit` path, the daemon removes the lock only while it still
holds its own stamp. The lock is a data-home file, not a run file, and no reader outside the
watcher uses it; the heartbeat (section 21) still says whether a daemon is running.

## 15. `sessions/<sessionId>.jsonl`

Redacted session stream of one agent call, append-only. Lines share `atMs` and `sessionId` and
have a `type`: `start` (`role`, `modelId`, `stepKey`, `packetType`), `packet` (the C7 packet as
JSON), `tool-call` (`tool`, `callIndex`, `input`), `tool-result` (`tool`, `callIndex`, `outcome`
`ok` \| `error`, `errorCode` `ERROR_*` or null, `preview` <= 6000), `text`, `usage`
(`callIndex`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`; cache counts
null when not reported), `output` (the C7 output as JSON), `end` (`outcome`, `error`,
`promptRefs[]`, `skillRefs[]`, `noteIds[]?`). The `end` line is written in a `finally` block, so failed
sessions still record the prompt and skill versions they used (topology section 10). The
`archive` step leaves session streams in `sessions/`.

`end.noteIds` (SPEC 0005 section 4.3, topology 0004 section 10): the ids of the learning notes the
session's packet carried in `inputs.learnings`, at most 64. The writer and director sessions write
it (an empty list when the packet carried none); other roles omit it. It is optional, so every
earlier session stream still validates and `format` stays `1`. Since SPEC 0005 the writer and
director packets carry the stage brief's notes (`inputs.learnings`, each text one
`<untrusted ref="..." note="...">` block), so the sentence "They reach no agent packet" in
section 17 holds only for the other roles.

## 16. `checks/`

`checks/<NN>-<stageId>/<checkId>-<attempt>.json`, one per check and attempt: `checkId`,
`stageNumber`, `stageId`, `attempt`, `outcome` (`passed` \| `failed` \| `error` \| `skipped`),
`expected`, `measured`, `detail`, `startedAtMs`, `durationMs`, `rawOutputPath` (the redacted
`.log` beside it) or null.

## 17. `stages/` and the per-stage archive

`stages/<NN>-<stageId>/` is the working folder of a stage:

- `brief.json` (step `brief`): `runId`, `stageNumber`, `stageId`, `phaseId`, `title`,
  `templateId`, `renderedAt`, `instructions` (Markdown), `bindings[]` (`slot`, `ref`), `inputs[]`
  (`name`, `fromStage`, `path`, `contentHash`), `checks[]`, `declaredOutputs[]` (`name`, `path`,
  `mimeType`, `optional?`; rev 4, section 6: absent or `false` means required), and
  `learnings?` (SPEC 0003, R2; see below).
- `brief.json.learnings` (optional; absent means "rendered before R2", so every earlier brief
  still validates and `format` stays `1`): at most 64 entries `{ slot, ref, notes[], omitted }`.
  `slot` is the binding slot, or null for a run reference; `ref` is `assetId@version`; `notes` are
  at most 10 `{ noteId, text, sourceRunId }`, newest first; `omitted` counts the notes the caps left
  out. The note text of one brief totals at most `STAGE_BRIEF_LEARNINGS_MAX_CHARS` (4000)
  characters. The notes are those active at the run's cutoff:
  `run.comparison?.learningsCutoff ?? run.createdAt` (created at or before it, not retired at or
  before it), so every attempt and a crash resume see the same notes. Biometric refs are skipped.
  The same notes are rendered into `instructions` under `## Aprendizados do catálogo`, after
  `## Brief`, each inside one `<untrusted ref="..." note="...">` block with closing tags escaped,
  under a fixed pt-BR line saying they are data, not instructions. They reach no agent packet.
  `brief.json` is hashed into `input-manifest.json.briefHash`, so each run records which notes it
  was given.
- `input-manifest.json` (step `snapshot`): `runId`, `stageNumber`, `stageId`, `attempt`,
  `createdAt`, `briefHash`, `assets[]` (`slot`, `ref`, `kind`, `contentHash`, `sizeBytes`,
  `storage` `store` \| `reference`), `inputs[]`, `parameters`, `models[]` (`role`, `modelId`).
  By-reference assets appear by ref and hash, never by path. `snapshot` writes `models: []`;
  after `execute` the engine adds, without duplicates, the models the executor reported in its
  C6 result (rev 3), so the `archive` copy names the models the stage ran with.
- The declared outputs, at the paths the brief names. An optional output (rev 4) may be missing.

`archive/<NN>-<stageId>/` receives the brief, the input manifest and the stage's evidence at step
`archive`; its existence is that step's postcondition. Outputs stay where `run.json` records them.

## 18. Outputs

`final.mp4`, `manifest.json`, `cost.json`, `qa/` and `report.md` exist before the run enters
`review` (criterion 3, K5).

**`final.mp4`**: the rendered video. It reaches `review` only after every `qa` check passed
(criterion 18).

**`manifest.json`** (criterion 8): `format`, `runId`, `createdAt`, `recipe` (`ref`,
`contentHash`), `assets[]` (`slot`, `ref`, `kind`, `contentHash`, `sensitivity`; every bound
version), `references[]` (`ref`, `contentHash`), `parameters` (`brief`, `stages[]` with their
`params`), `models[]` (`role`, `modelId`), `outputs[]` (`name`, `path`, `contentHash`,
`sizeBytes`), `egress[]` ("what left the machine": `provider`, `what` `prompt-text` \|
`tts-text` \| `audio` \| `frames` \| `page-fetch`, `stepKey`, `sessionId`, `at`, `summary`,
optional `measure`; at most 1000). `package` fills `egress[]` with the complete lines of
`egress.jsonl` (section 20); an absent file gives an empty list.

**`cost.json`** (criterion 19): `format`, `runId`, `currency` (`USD`), `priceTableVersion`,
`updatedAt`, `sessions[]`, `totalUsd`. `totalUsd` equals the sum of `sessions[].usd` (within
$0.000001); a file that breaks this does not validate. Session kinds:

- `model`: `sessionId`, `callIndex`, `stepKey`, `role`, `provider` (`claude`), `modelId`,
  `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` (null when not reported),
  `usd`, `outcome`, `startedAt`, `endedAt`. Every billed call is an entry, schema-feedback and
  billed rate-limit retries included; `callIndex` separates the calls of one session.
- `tts`: `sessionId`, `stepKey`, `provider` (`elevenlabs` \| `local-voice`), `characters`, `usd`, `at`.
- `render`: `sessionId`, `stepKey`, `provider` (`render`), `renderSeconds`, `usd`, `at`.

Mock sessions are recorded with `usd: 0`.

**`qa/`**:

- `summary.json`: `runId`, `createdAt`, `outcome` (`passed` \| `passed-with-warnings`),
  `metrics` (`container`, `videoCodec`, `durationMs`, `width`, `height`, `fps`, `audio`
  `{ status: present, codec, integratedLufs, truePeakDbtp }` or `{ status: absent }`,
  `blackRuns[]`, `captionMaxDriftMs`), `checks[]` (check results), `reviews[]` (`recorded` with
  `subject`, `overall`, `verdictPath`; or `unavailable` with `subject`, `reason`), `warnings[]` (pt-BR).
- `media-review.json`: the media review command's JSON report (toolbox contract C9).
- `review-<subject>.json`: a Reviewer `ReviewVerdict` (C7), evidence only.

**`report.md`**: section 9.

## 19. Reading and writing in code

```ts
import {
  appendEgressEntry,
  appendRunEvent,
  readEgressEntries,
  readRunEvents,
  readRunFile,
  writeRunFile,
} from '@studio/shared/run-files';
```

`@studio/shared/run-files` is Node-only. It validates every value against its schema before
writing, refuses paths that leave the run folder, and raises typed errors with a `code`:
`not-found`, `invalid-json`, `schema-mismatch`, `unsupported-format`, `write-failed`,
`path-outside-run`, `append-only-violated`. Optional files (`control.json`, `approval.json`,
`watcher.pid`, `now.json`, outputs before `package`) read as `{ status: 'absent' }` or
`{ status: 'present', value }`.

## 20. `egress.jsonl`

Numbered last so existing references to sections 1-19 stay valid (added by SPEC 0002 rev 3).

The "what left the machine" log (PRD 7.4, 12). Append-only, one JSON object per line, written only
by the watcher through `appendEgressEntry` (C5) for every external call, before the payload
leaves, so a watcher crash no longer loses the list. Local providers (`local-voice`, `render`)
send nothing off the machine and are not listed. A line never holds content, only its size.

| Field | Type | Meaning |
|---|---|---|
| `provider` | provider name | `claude`, `elevenlabs`, `capture` (local providers are not listed) |
| `what` | `prompt-text` \| `tts-text` \| `audio` \| `frames` \| `page-fetch` | Purpose of the payload |
| `stepKey` | step key | The step that made the call |
| `sessionId` | session id or null | The agent session, when the call belongs to one |
| `at` | ISO-8601 instant | When the call was recorded |
| `summary` | pt-BR text <= 300 | Redacted description built from labels and a count, e.g. `texto do prompt, 1.240 tokens` |
| `measure` | `{ unit, amount }` | Size only: `unit` `characters` \| `tokens` \| `bytes` \| `pages`, `amount` a non-negative integer; optional for readers, always written |

A run holds at most 1000 lines; the writer refuses the next external call instead of dropping a
record. Readers use `readEgressEntries(runDir, fromByte)`, which returns complete lines and the
next offset like `readRunEvents`; a missing file reads as an empty page. `package` copies the
complete lines into `manifest.json.egress` (section 18).

## 21. `logs/watcher.heartbeat.json`

Numbered last so existing references to sections 1-20 stay valid (added by SPEC 0002 rev 4,
section 13.3; ADR 0003 "Rev 4 addition: watcher heartbeat file").

`<data home>/logs/watcher.heartbeat.json` says whether the watcher daemon is running. It is a
data-home file, not a run file: it sits outside every run folder and no run file changes.

| Field | Type | Meaning |
|---|---|---|
| `format` | `1` | Section 3; a reader that meets a higher number refuses the file |
| `at` | ISO-8601 instant | When the daemon wrote this beat |

- **No pid.** The object is strict and holds no pid, no run id and no path. Owner-only: mode
  `0600` in the `0700` `logs/` folder.
- **Writer:** the watcher daemon only, through `writeWatcherHeartbeat(logsDir, heartbeat)` (C5:
  temp file, flush, rename). It is a new single-writer file; no existing file changes owner, and
  the api and CLI never write it.
- **Timing:** one write at daemon start, then one every `WATCHER_HEARTBEAT_INTERVAL_MS` (2000 ms)
  on a timer that does not wait for the run loop, so beats continue while a step executes. A
  failed write never stops the daemon. The file is never deleted, so a stopped watcher reads
  `dead` and only a data home that never ran one reads `absent`.
- **Reader:** the api, for `GET /watcher`, through `readWatcherHeartbeat(logsDir)`, which returns
  `{ status: 'absent' }` or `{ status: 'present', value }` and throws a typed error for a link, a
  non-regular file, a file over 1 KiB, invalid JSON or a schema mismatch. With `now` the server
  clock and `window` = `WATCHER_HEARTBEAT_STALE_AFTER_MS` (10000 ms):

| Heartbeat file | `state` | `lastSeenAt` |
|---|---|---|
| missing | `absent` | `null` |
| valid, `now - at <= window` and `at - now <= window` | `alive` | `at` |
| valid, older than the window | `dead` | `at` |
| valid, dated more than the window in the future | `dead` | `null` |
| unreadable or invalid | `dead` | `null` |

The api never signals a process, never reads `watcher.pid` or a process table for this route, and
its response carries no pid. The per-run `watcher.pid` (section 14) is unchanged: it still decides
who owns one run; the heartbeat says only that the daemon process is running.

## 22. `<data home>/models/embeddings/<modelRef>/`

Numbered last so existing references to sections 1-21 stay valid (added by SPEC 0003 R2, section
5.2; ADR 0004; assumption B6).

The local embedding model used for search by meaning. It is a data-home folder, not a run file:
it sits outside every run folder, no run file changes, and nothing in it is read by the watcher.
`models/` is a fifth data-home folder beside `db/`, `assets/`, `runs/` and `logs/`.

| Item | Rule |
|---|---|
| Path | `<data home>/models/embeddings/<modelRef>/`, mode `0700`. `<modelRef>` is `<model id>@<revision>`, one path segment, as pinned in the committed manifest `scripts/models/embedding-model.manifest.json` (`EmbeddingModelManifestSchema`, `@studio/shared/catalog`) |
| Content | Exactly the files the manifest lists, each at its manifest-relative `path`, with the pinned `sha256` and `sizeBytes`. No catalog data, vector or run data is written here |
| Writers | `scripts/install.sh` (one step after the data-home step) and `studio models fetch`. Each skips a file already present with the pinned hash, downloads a missing one from the pinned revision to a temporary name, verifies hash and size, then renames; a mismatch deletes the temporary file. A failed download does not fail the install (B7). The download sends no catalog data |
| Readers | The api and the CLI, in process. Before the first inference of each process, core re-hashes every manifest file; a missing file, a size or a hash mismatch refuses the load (model state `rejected`, search answers 503 `embedding-unavailable`) and downloads nothing. Remote model loading is disabled: this folder is the only model source |
| Model swap | A new model is a new manifest with a new `modelRef`, so a new folder. Vectors from the old `modelRef` become `stale` and are never compared with a query from the new model. The old folder is left in place; removing it is a manual step |
| Removal | Deleting the folder at any time leaves the studio working; search by meaning then answers 503 and the model state reads `absent`. `scripts/uninstall.sh --purge` removes it with the whole data folder |

## 23. `<data home>/curations/<curationId>/`

Numbered last so existing references to sections 1-22 stay valid (added by SPEC 0005, sections
4.2, 4.3 and 4.6; topology 0004 section 4). Executable form: `@studio/shared/curation` (schemas and
constants, browser-safe) and `@studio/shared/curation/files` (Node-only helpers).

One Curator request: the owner asks for a proposed new version of a prompt, skill or recipe
version, the watcher runs the Curator between runs, and the owner decides. It is a data-home
folder, not a run file: it sits outside every run folder and no run file changes. `curations/` is
a sixth data-home folder beside `db/`, `assets/`, `runs/`, `logs/` and `models/`; mode `0700` for
the folder and each curation folder, `0600` for every file.

```text
curations/<curationId>/
  curation.json    api writes once (status requested); the watcher is the single writer after its claim
  proposal.json    watcher, once, only when the status becomes proposed
  cost.json        watcher, after every billed Curator call
  session.jsonl    watcher, redacted Curator session lines, append-only
  events.jsonl     watcher, append-only
```

| Item | Rule |
|---|---|
| Id | `curationId`, a ULID like `runId`; it is the folder name. Validated before any path is joined; the helpers resolve only the five file names above, inside a folder named `curations`, and refuse anything else (`CurationPathError`, code `path-outside-run`) |
| Writers | The api creates the folder exclusively and writes `curation.json` with status `requested`, once (`createRequestedCuration`), and never writes in the folder again. The watcher claims the request (`collecting`) and is then the only writer (`writeCurationState`, which refuses status `requested`). The watcher writes nothing outside the claimed folder and never writes SQLite |
| Readers | The api (views, cost indexing), the watcher (queue, sweep) and the CLI (`doctor`, `status`). The queue and the "already requested" rule are read from these files, the only source of truth |
| Conventions | Section 2 applies: UTF-8, atomic whole-file writes, strict objects, append-only JSON lines. Times are ISO-8601 instants (`at`, `...At`), including in `events.jsonl` and `session.jsonl`. JSON files carry `"format": 1` and section 3 applies |
| Logs and events | Ids, reason ids, counts and amounts only: never a body, note, focus, reason, summary, diff, packet or output text |
| Removal | A curation folder can be deleted by hand without effect on runs; its decision row and indexed cost stay in SQLite |

**`curation.json`** (`CurationFileSchema`): `format`, `curationId`, `status`, `subject`
(`{ kind, ref }`), `ownerFocus?` (1-500, plain owner text; delimited only inside the packet),
`correlationId` (the api's `x-request-id`), `requestedAt`, `claim?` (`{ pid, claimedAt }`),
`attempts` (0-2), `spentUsd`, `modelId?`, `instructionVersion?`, `sessionIds[]` (at most 2),
`reasonId?`, `failedChecks[]?` (at most 8), `noChangeReason?` (<= 1000), `updatedAt`, `endedAt?`.
Rules: `requested` has no `claim`, `attempts: 0` and `spentUsd: 0`; a terminal status has
`endedAt`; `proposed` has no `reasonId`; `noChangeReason` is present exactly when the status is
`no-change`.

| `status` | Meaning | `reasonId` |
|---|---|---|
| `requested` | Waiting; at most 3 at a time, one per subject | - |
| `collecting` | Claimed by the watcher (between runs only) | - |
| `proposed` | `proposal.json` exists | none |
| `no-change` | The Curator saw no reason for a new version | none; `noChangeReason` holds its reason |
| `no-proposal` | The ground check failed on the last attempt | the failed check id |
| `failed` | `call-timeout`, `curation-timeout`, `provider-error`, `rate-limited`, `output-invalid`, `watcher-stopped`, `watcher-restarted`, `internal-error` | required |
| `refused` | Before any model call, $0 spent: `month-spend-unavailable`, `over-month-ceiling`, `over-curation-ceiling`, `packet-secret-found`, `redactor-unavailable`, `subject-refused`, `evidence-unavailable` | required |

The last five statuses are terminal. A crashed or stopped curation is not resumed: at watcher start
the watcher fails every `collecting` file (`failed` / `watcher-restarted`), whatever its
`claim.pid`, because the new process has claimed nothing yet; the owner asks again.

Subject kinds are `prompt`, `skill` and `recipe` (text bodies only). Asset and recipe refs share
the `<id>@<version>` shape, so `kind` always travels beside `ref`.

**`proposal.json`** (`CurationProposalSchema`): `format`, `curationId`, `subject`,
`baseBodySha256`, `newBody` (1-16,000), `diff` (unified line diff computed by the ground check,
<= 80,000; the model never writes it), `diffStats` (`addedLines`, `removedLines`), `changeSummary`
(<= 600), `reason` (<= 1000), `evidenceRunIds[]` (1-5), `expectedEffect` (<= 300),
`suggestComparison`, `checks[]` (`{ id, passed: true }`, at most 8), `attempt` (1-2), `modelId`,
`instructionVersion`, `createdAt`. Written once; the api only reads it. Nothing here is a catalog
version until the owner saves it as a `draft` with provenance `{ type: 'curator', curationId }`.

Ground-check ids: `evidence-in-packet`, `evidence-used-subject`, `evidence-owner-reviewed`,
`body-changed`, `body-within-cap`, `recipe-json-valid`, `bindings-resolvable`, `redactor-clean`.
The fixable ones (a second, corrective call is allowed on attempt 1) are `evidence-in-packet`,
`body-changed`, `body-within-cap` and `recipe-json-valid`.

**`cost.json`** (`CurationCostFileSchema`): `format`, `curationId`, `currency` (`USD`),
`priceTableVersion`, `updatedAt`, `sessions[]` (at most 8), `totalUsd`, which equals the sum of
`sessions[].usd` within $0.000001. Each session: `sessionId`, `callIndex`, `attempt` (1-2), `kind`
(`model`), `role` (`curator`), `provider` (`claude`), `modelId`, `inputTokens`, `outputTokens`,
`cacheReadTokens`, `cacheWriteTokens`, `usd`, `outcome`, `startedAt`, `endedAt`. Outcomes: `ok`,
`schema-retry`, `corrective`, `failed`, `refused`, `no-change`. Every billed Curator call is an
entry; rate-limit transport retries inside one call are not separate calls. A curation never
records more than $1.00. The api indexes the entries into `cost_entries` with
`source_kind = 'curation'`, `run_id` = the curation id and `step_key` = `curation:call:<attempt>`,
so the month-to-date total covers runs, comparisons and curations.

**`session.jsonl`** (`CurationSessionLineSchema`), redacted before every write; a redactor failure
writes nothing and fails the call. Lines share `sessionId` and `at` and have a `type`: `start`
(`curationId`, `attempt`, `role` `curator`, `modelId`, `instructionVersion`), `prompt` (`text`,
the redacted packet rendering), `output` (`text`, the redacted answer), `end` (`outcome`,
`instructionVersion`, `usage` `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`
or null when the call ended before any usage was reported). The `end` line is written in a
`finally` block, so failed calls record `curator@1` too.

**`events.jsonl`** (`CurationEventSchema`): every line has `type`, `at` and `curationId`.

| `type` | Fields |
|---|---|
| `curation.claimed` | `pid` |
| `curation.collected` | `counts` `{ runs, notes, evidence, declined }` |
| `curation.call.started` | `sessionId`, `attempt`, `role` `curator`, `modelId`, `instructionVersion` |
| `curation.call.ended` | `sessionId`, `attempt`, `outcome`, `tokens` (the four counts, or null), `usd`, `durationMs` |
| `curation.check` | `attempt`, `passed[]`, `failed[]` (check ids) |
| `curation.ended` | `status` (terminal), `reasonId` or null, `spentUsd`, `durationMs` |

`curation.requested`, `curation.refused-request` and `curation.decided` are api log lines only,
never lines of this file.

Bounds (`curationBounds`): 2 Curator calls per curation, 120 s per call, 300 s per curation, 8,000
output tokens per call, 16,000 body characters in and out, $1.00 per curation, 3 waiting requests,
the subject's last 3 declined proposals, 20 runs, 10 notes, 5 evidence excerpts of 600 characters,
a 500-character owner focus, a 300-character decline reason, an 80,000-character diff.

Reading and writing in code:

```ts
import { CurationFileSchema, curationBounds, curationFileNames } from '@studio/shared/curation';
import {
  appendCurationEvent,
  appendCurationSessionLine,
  createRequestedCuration,
  curationLocationFromDirectory,
  listCurationIds,
  readCurationCost,
  readCurationProposal,
  readCurationState,
  writeCurationCost,
  writeCurationProposal,
  writeCurationState,
} from '@studio/shared/curation/files';
```

The helpers take a `CurationLocation` (`{ curationsRoot, curationId }`); `curationLocationFromDirectory`
turns the absolute `curationDir` the C6 ports receive into one and refuses a folder that is not
`<folder named curations>/<ULID>`. They raise the run-file typed errors of section 19 plus
`CurationFileExistsError` (an existing curation folder, or a second `proposal.json`). Optional
files read as `{ status: 'absent' }` or `{ status: 'present', value }`; `listCurationIds` returns
the ULID-named folders oldest first and ignores links and other names.

## 24. `<data home>/schedules/<scheduleId>/`

Numbered last so existing references to sections 1-23 stay valid (added by SPEC 0006, sections
4.2, 4.3, 4.6, 5.5 and 5.6; owner decision OD4). Executable form: `@studio/shared/schedules`
(schemas, constants and the pure slot functions `nextSlots` and `dueSlots`, browser-safe) and
`@studio/shared/schedules/files` (Node-only helpers).

A schedule starts runs without a click: the api or CLI writes the schedule, and the watcher, the
single run writer, creates a run at `pending` from a due slot, between runs. Every scheduled run
waits at the plan gate like any run, stops at `review` and never publishes. Slots missed while the
Mac sleeps are logged, never replayed. `schedules/` is a seventh data-home folder beside `db/`,
`assets/`, `runs/`, `logs/`, `models/` and `curations/`; mode `0700` for the folder and each
schedule folder, `0600` for every file.

```text
schedules/<scheduleId>/
  schedule.json   api or CLI: create, pause, resume, delete (status), add or remove briefs
  cursor.json     watcher only: how far slots were evaluated
  slots.jsonl     watcher only: append-only, one line per decided slot
  fire.lock       watcher only: exists while one process decides due slots
  fire.lock.takeover  watcher only: exists while one process replaces a stale fire.lock
  fired/<slotMs>  watcher only: O_EXCL claim taken before a slot's run is written
```

| Item | Rule |
|---|---|
| Id | `scheduleId`, a ULID; it is the folder name. Validated before any path is joined; the helpers resolve only the five file names and the `fired/<slotMs>` claims above, inside a folder named `schedules`, and refuse anything else (`SchedulePathError`, code `path-outside-run`) |
| Writers | The api or CLI creates the folder exclusively and writes `schedule.json` with status `active` (`createSchedule`), then rewrites it atomically for each control action (`rewriteScheduleFile`, which never creates a schedule). The watcher writes only `cursor.json` (`writeScheduleCursor`), `slots.jsonl` (`appendSlotLine`), `fire.lock` and `fire.lock.takeover` (`acquireFireLock`, `releaseFireLock`) and `fired/<slotMs>` (`claimSlot`, `releaseSlotClaim`), and only between runs; a second watcher process skips a schedule whose `fire.lock` a live process holds, and a slot whose claim exists is never fired again. No file has two writers |
| Runs | The watcher's one write per fired slot is `runs/<runId>/run.json` at `pending` with `createdBy: 'watcher'` and `schedule` (section 8, **RunScheduleLink**). It never writes `approval.json`, `control.json`, any other status, or SQLite |
| Readers | The api (views, next slots, index sync of fired runs from new `fired` lines), the watcher (due evaluation) and the CLI (`schedules`, `status`, `doctor`) |
| Conventions | Section 2 applies: UTF-8, atomic whole-file writes, strict objects, append-only JSON lines. Times are ISO-8601 instants. JSON files carry `"format": 1` and section 3 applies |
| Logs and events | Ids, reason ids, counts and amounts only: never brief text or a title |
| Removal | Code never removes a schedule folder; `deleted` is a status and `slots.jsonl` stays as the audit record. A folder removed by hand has no effect on runs |

**`schedule.json`** (`ScheduleFileSchema`): `format`, `scheduleId`, `title` (1-120), `status`
(`active` \| `paused` \| `deleted`; `deleted` is terminal), `statusSince` (resuming sets it to now,
so no slot from the paused period is evaluated), `createdAt`, `updatedAt`, `createdBy` (`api` \|
`cli`), `correlationId` (id \| null), `recipeRef` (pinned `recipeId@version`), `recurrence`,
`timezone` (an IANA zone known to the runtime), `briefMode` (`queue` \| `repeat`; new schedules
use `queue`, owner answer Q5), `briefs[]` (1-50, unique `briefId`), `costConsent`
(`{ perRunUsd, acceptedAt }`: the pinned recipe's resolved per-run ceiling the owner accepted).

Each brief (`ScheduleBriefSchema`): `briefId` (ULID, server-generated), `brief` (the run Brief of
section 8), `references[]` (`assetId@version`, at most 50), `title?` (1-200). Brief text is owner
text; it is copied into the fired `run.json` and stays untrusted data for agents.

`recurrence` (`RecurrenceSchema`), local wall-clock times `HH:MM` in `timezone`:

| `kind` | Fields | Slots |
|---|---|---|
| `once` | `date`, `time` | One |
| `daily` | `time` | Every day (the finest recurrence) |
| `weekly` | `weekdays[]` (1 = Monday ... 7 = Sunday, 1-7 entries), `time` | Those weekdays |
| `monthly` | `dayOfMonth` (1-28), `time` | That day of every month |

A local time that does not exist (spring forward) moves to the first valid minute after it; a
local time that happens twice (fall back) uses the first occurrence. Instants are computed with
`Intl.DateTimeFormat`, no dependency.

**`cursor.json`** (`ScheduleCursorSchema`): `format`, `scheduleId`, `evaluatedThrough` (ISO
instant), `updatedAt`. Written after the slot lines of each evaluation. A schedule with no cursor
is evaluated from its `statusSince`, so nothing before creation or resume is ever due.

**`slots.jsonl`** (`SlotLineSchema`), one line per decided slot: `slotAt`, `decidedAt`, `result`,
`reasonId`, `runId`, `briefId`. Rules: `reasonId` is null exactly when `result` is `fired`;
`runId` and `briefId` are both set exactly when `result` is `fired`.

| `result` | `reasonId` |
|---|---|
| `fired` | null; `runId` and `briefId` name the created run and the brief it used |
| `missed` | `watcher-busy` (this process was executing a run or curation at the slot instant) or `watcher-not-running` (asleep, off or stopped; the watcher cannot tell them apart) |
| `skipped` | The first guard hit, in order: `previous-run-open`, `review-backlog` (3 runs at `review`), `brief-queue-empty`, `month-spend-unavailable`, `over-month-ceiling`, `recipe-not-runnable`, `bindings-unresolvable`; or `schedule-unreadable`, `internal-error` |

Evaluation (watcher, only when no run is startable, before curations): the window is
`(max(cursor.evaluatedThrough, statusSince), now]`, at most 400 slots (`dueSlots`, newest kept).
Every slot older than `lateGraceMs` (2 hours, owner answer Q6) is `missed`; of the slots within the
grace only the newest is a fire candidate and the others are `missed`, so one evaluation never
fires two runs for one schedule. Order of writes: run file, slot line, cursor.

Bounds (`scheduleBounds`): 10 schedules not `deleted`, 50 briefs, a 2-hour late grace, 3 open
reviews, 400 slots per evaluation, 20 slot lines and 5 next slots shown, a 120-character title.

Reading and writing in code:

```ts
import { ScheduleFileSchema, dueSlots, nextSlots, scheduleBounds, scheduleFileNames } from '@studio/shared/schedules';
import {
  appendSlotLine,
  createSchedule,
  listScheduleIds,
  readScheduleCursor,
  readScheduleFile,
  readSlotLines,
  rewriteScheduleFile,
  writeScheduleCursor,
} from '@studio/shared/schedules/files';
```

The helpers take a `ScheduleLocation` (`{ schedulesRoot, scheduleId }`). They raise the run-file
typed errors of section 19 plus `ScheduleFileExistsError` (an existing schedule folder). Optional
files read as `{ status: 'absent' }` or `{ status: 'present', value }`; `listScheduleIds` returns
the ULID-named folders oldest first and ignores links and other names. The api imports only
`createSchedule`, `rewriteScheduleFile` and the readers; the watcher only `writeScheduleCursor`,
`appendSlotLine` and the readers.

## 25. `publications.jsonl`

Numbered after section 24 so existing references stay valid (added by SPEC 0007, sections 4.3,
5.4 and 5.5; owner decisions OD4 and OD5). Executable form: `RunPublicationLineSchema` in
`@studio/shared/run-format` (also re-exported by `@studio/shared/platforms`), written and read only
through `appendRunPublicationLine` and `readRunPublicationLines` in `@studio/shared/run-files`.

`runs/<runId>/publications.jsonl` is the owner-visible record of what left the machine **after**
approval: one line per studio upload event. It is separate from `egress.jsonl` because a
publication has no `stepKey` and happens after the run ended, and `ProviderNameSchema` and
`EgressEntrySchema` stay closed (SPEC 0007 L7). An optional file: `format` stays 1 and a missing
file reads as an empty page.

| Item | Rule |
|---|---|
| Writer | The watcher only, append-only (section 2), and only for a run whose status is `approved`. No other run-folder file is touched after approval |
| When | `upload-started` before the first byte leaves (so a crash never loses the record); then exactly one closing line: `published`, `sent-to-inbox`, `failed` or `outcome-unknown`. An attempt that never started an upload (cancelled, expired, refused at the watcher's re-check) writes no line |
| Readers | The api (`RunPublishView.leftTheMachine`, the newest 100 lines), the web run page and `studio runs show`, which render "O que saiu da máquina" from `manifest.json.egress` followed by these lines. `report.md` is not rewritten (SPEC 0007 L5) |
| Content | Sizes, the hash, the visibility and the confirmed biometric refs only: never a title, caption, tag, URL, path, account label or token |

Each line (`RunPublicationLineSchema`, strict): `at` (ISO instant), `attemptId` (ULID), `platform`
(`youtube` \| `instagram` \| `tiktok`), `mode` (`mock` \| `live`), `event` (`upload-started` \|
`published` \| `sent-to-inbox` \| `failed` \| `outcome-unknown`), `sizeBytes` (positive, at most
4 GiB), `artifactSha256` (lowercase hex, always `final.mp4`), `visibility` (`public` \| `unlisted`
\| `private`), `biometricRefs[]` (`assetId@version`, at most 64, the set the owner confirmed),
`platformVideoId` (at most 40 characters, or null), `reasonId` (`PublishFailureReason`, or null).
Rules: `reasonId` is set exactly when `event` is `failed`; a `published` line names
`platformVideoId`.

## 26. `<data home>/platform/`

Added by SPEC 0007 (sections 4.2, 4.3, 4.6 and 5.2). Executable form: `@studio/shared/platforms`
(constants, enums, file schemas and the pure functions `pollDue`, `capabilityStatus`,
`applyGateChange`, `canTransitionPublishState`, browser-safe) and `@studio/shared/platforms/files`
(Node-only helpers). `platform/` is an eighth data-home folder beside `db/`, `assets/`, `runs/`,
`logs/`, `models/`, `curations/` and `schedules/`; mode `0700` for every folder and `0600` for every
file. Connected accounts, gates and the poll cursor are files, not tables, because the watcher must
write two of them and never writes SQLite (K1).

```text
platform/gates.json                          api or CLI: the owner's gate changes
         accounts/<platform>/account.json    api or CLI: connect, reconnect, disconnect
                             health.json     watcher: token health, backoff, last poll
                             token.lock      api, CLI or watcher: O_EXCL, held for a Keychain write
         publish/<attemptId>/request.json    api or CLI: written once by RequestPublish
                             cancel          api or CLI: O_EXCL marker, only before the claim
                             claim           watcher: O_EXCL, the claimant's pid; never removed
                             state.json      watcher: atomic rewrite
         polls/cursor.json                   watcher
         metrics-inbox/<batchId>.json        watcher creates once; IngestMetricBatch deletes
```

| Item | Rule |
|---|---|
| Ids and paths | `<platform>` is checked with `PlatformSchema`; `attemptId` and `batchId` are ULIDs validated before any join. The helpers resolve only the names above, inside a folder named `platform`, and refuse anything else (`PlatformPathError`, code `path-outside-run`) |
| Secrets | No file here holds a token, an OAuth code, a `state`, a PKCE verifier or a client secret. Tokens live only in the Keychain service `com.videostudio.platform-tokens` (one item per platform) and in process memory (K3) |
| Owner text | The publish title, caption and tags exist only in `request.json`; they go to the platform and nowhere else (not SQLite, logs, events, responses or `publications.jsonl`) |
| Writers | Section 4. The api and CLI import only `writeGatesFile`, `writeAccountFile`, `createPublishRequest`, `createCancelMarker` and `deleteMetricBatch`; the watcher only `writeHealthFile`, `claimPublishAttempt`, `writePublishState`, `writePollCursor` and `createMetricBatch`; all three use `acquireTokenLock` and `releaseTokenLock` |
| Conventions | Section 2 applies: UTF-8, atomic whole-file writes, strict objects. JSON files carry `"format": 1` and section 3 applies. An unreadable file is skipped with a reason, never guessed |
| Logs and events | Ids, counts, states, reason ids and byte counts only (SPEC 0007 K7) |

**`gates.json`** (`GatesFileSchema`): `format`, `gates` (one `{ metrics, publish }` entry per
platform, each `awaiting-review` \| `enabled`), `updatedAt`, `updatedBy`. Absent reads as
`defaultGates`: YouTube both `enabled`; Instagram and TikTok both `awaiting-review`. Only the owner
changes a gate; Instagram `publish` cannot be enabled (`platformPublishSupport`, OD8).

**`account.json`** (`AccountFileSchema`): `format`, `platform`, `connectionId` (ULID, new on every
connect), `state` (`connected` \| `disconnected`), `mode`, `accountLabel` (at most 100, shown and
never logged), `platformAccountId` (`[A-Za-z0-9_.-]{1,64}`), `scopes[]` (at most 12),
`capabilities[]` (unique), `connectedAt`, `connectedBy`, `disconnectedAt` (set exactly when
`disconnected`), `correlationId`.

**`health.json`** (`HealthFileSchema`): `format`, `platform`, `connectionId` (the connection it
applies to), `token` (`ok` \| `needs-reconnect`), `reconnectReason` (set exactly when
`needs-reconnect`), `checkedAt`, `backoff` (`{ reasonId, level 1-5, until }` or null),
`lastPollAt`.

**`token.lock`**: an O_EXCL file holding the owner's decimal pid. Held around every Keychain write
or delete of the platform's tokens; the watcher re-reads `account.json` after taking it and writes
nothing when the account is `disconnected` or its `connectionId` changed. A live lock is `held`
even for the same pid. A lock older than 60 s, or whose owner is gone, is stale and removed by its
finder (still the same inode), with no takeover protocol.

**`request.json`** (`PublishRequestFileSchema`): `format`, `attemptId`, `runId`, `platform`,
`connectionId`, `mode`, `requestedAt`, `expiresAt` (requested + 2 h), `requestedBy`, `createdBy`
(`api` \| `cli`), `correlationId`, `artifact` (`{ sha256, sizeBytes }` of `final.mp4`, at most
4 GiB), `approvalDecidedAt`, `metadata` (`{ title 1-100, caption 0-2200, tags[] at most 30 of
[letters, digits, _]{1,50}, visibility, aiDisclosure }`), `biometric` (`{ refs[] at most 64,
confirmedAt }`).

**`cancel`** and **`claim`**: `cancel` is an empty O_EXCL marker the api or CLI creates only while
no `claim` exists; `claim` is the watcher's O_EXCL file with its pid. The watcher checks `cancel`
again right after creating `claim`, so a cancel that races the claim wins and no byte is sent. A
claim is never removed: a claimed attempt is never uploaded again (K5).

**`state.json`** (`PublishStateFileSchema`): `format`, `attemptId`, `state` (`queued` \|
`uploading` \| `processing` \| `sent-to-inbox` open; `published` \| `failed` \| `cancelled` \|
`expired` \| `outcome-unknown` \| `inbox-unconfirmed` terminal), `since`, `bytesSent` (at most
`bytesTotal`), `bytesTotal`, `reasonId` (set exactly when `failed`), `platformVideoId`,
`platformMediaId`, `publishedAt` (a `published` state names it and `platformVideoId`),
`followUntil` (set while `sent-to-inbox`), and the optional `publicationUrl` (amended 2026-11-20,
SPEC 0007 wave 4: the post link a platform reported for a `published` attempt, written only when
`parsePublicationUrl` recognizes it for the same platform and video id; absent otherwise). Moves are forward only (`canTransitionPublishState`):
terminal states never change, `cancelled` and `expired` only from `queued`.

**`cursor.json`** (`PollCursorFileSchema`): `format`, `updatedAt`, `entries` keyed by
`publicationId`: `{ lastPolledOn, stopped (PollStopReason or null), strikes 0-3,
platformMediaId }`. Due days follow `pollDue` (daily through day 30, weekly to day 180, then
`window-closed`); missed days are never replayed.

**`metrics-inbox/<batchId>.json`** (`MetricBatchFileSchema`): `format`, `batchId` (equal to the
file name), `platform`, `mode`, `asOfDate` (the local day of the pull), `pulledAt`, `rows[]` (1-50,
one per publication, each `{ publicationId, metrics }` in the shared `PlatformMetrics` shape). At
most 256 KiB. Written to a temp name and hard-linked into place, so a batch is never replaced and
never seen partial; a batch that fails to read is left in place and logged
`metrics.batch-refused`.

Reading and writing in code:

```ts
import { GatesFileSchema, capabilityStatus, defaultGates, pollDue, platformFileNames } from '@studio/shared/platforms';
import {
  acquireTokenLock,
  claimPublishAttempt,
  createCancelMarker,
  createMetricBatch,
  createPublishRequest,
  listMetricBatchIds,
  listPublishAttemptIds,
  readAccountFile,
  readMetricBatch,
  writePublishState,
} from '@studio/shared/platforms/files';
```

The helpers take the absolute `platform/` root (`DataHome.platform`). They raise the run-file typed
errors of section 19 plus `PublishAttemptExistsError`, `MetricBatchExistsError` and
`MetricBatchRefusedError`. Optional files read as `{ status: 'absent' }` or
`{ status: 'present', value }`; the list helpers return ULID-named entries oldest first and ignore
links, temp files and other names.

## 27. `<data home>/hyperframes/`

Added by SPEC 0008 (sections 4.2, 4.5, 5.5 and 5.6; owner decisions OD3 to OD5). Executable form:
`@studio/shared/hyperframes` (constants, file schemas, `engineState`, `hyperframesPaths`, template
checks, variable resolution) and the Node-only `@studio/shared/hyperframes/files`.

```
<data home>/hyperframes/engine.json     CLI: enable, disable
                        chrome.json     CLI: chrome install
                        trace.json      CLI: trace
                        config/         CLI: config.json seeded once, before any process starts
                        cache/          the HyperFrames process only (Chrome lives under it)
                        home/           nobody; stays empty (the process's HOME)
```

Folders `0700`, files `0600`. The folder does not exist until the owner runs a `studio hyperframes`
command; `DataHome` and `ensureDataHomeDirectories` do not create it. An absent folder means the
engine is off. Removing the data home removes this folder, Chrome included.

**`engine.json`** (`HyperframesEngineFileSchema`): `format: 1`, `state` (`disabled` or `enabled`),
`updatedAt`, `updatedBy`. `enable` writes `enabled` only when `engineState` would be `ready`;
`disable` always works.

**`chrome.json`** (`HyperframesChromeFileSchema`): `format: 1`, `version` (`158.0.8127.36`, the
pinned `chrome-headless-shell`), `executablePath` (inside `cache/`, refused anywhere else), `sha256`,
`sizeBytes`, `installedAt`, `installedBy`. A path outside `cache/` or a missing binary reads as
`chrome-missing`.

**`trace.json`** (`HyperframesTraceFileSchema`): `format: 1`, `result` (`pass` or `fail`), `at`,
`by`, `pin`, `chromeSha256`, `profileSha256`, `templateContentHash`, `controlDenied`,
`renderExitCode`, `outputOk`, `deniedNetwork`, `ownerConfigDirDenied`, `findings[]` (at most 20, 200
characters each). The record of the owner-run network trace (SPEC 0008 section 5.6).

`engineState`, first match: no `engine.json` or `state: 'disabled'` gives `engine-disabled`; no
`chrome.json`, or its binary is missing, gives `chrome-missing`; no `config/config.json` gives
`runtime-not-prepared`; no valid `trace.json` gives `trace-missing`; a trace that did not pass, or
whose pin, Chrome hash or sandbox profile hash differs from the current one, gives `trace-stale`;
otherwise `ready`. An unreadable, linked or invalid file is never read as present.

Reading and writing in code:

```ts
import { engineState, hyperframesPaths, HYPERFRAMES_PIN } from '@studio/shared/hyperframes';
import { readHyperframesEngineFiles, writeEngineFile } from '@studio/shared/hyperframes/files';
```

The helpers take the absolute data home root and resolve every path through `hyperframesPaths`,
so none reaches outside `hyperframes/`. Writers raise the run-file typed errors of section 19 and
`HyperframesPathError`; readers answer `{ status: 'absent' }`, `{ status: 'invalid' }` or
`{ status: 'present', value }`.
