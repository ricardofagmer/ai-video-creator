---
domain: backend
risk: high
spec: docs/specs/0006-r3-outside-signals-and-packaging.md
security_review: pending
---

# R3 implementation: outside signals and packaging (SPEC 0006 rev 1)

## What
Implementation of the frozen SPEC 0006 ticket frontier: R3-01 shared contracts first, then core,
watcher, api, web, CLI, shell and trace export. No git (the folder is not a repository): in-place
workers with exclusive file scopes; the supervisor integrates each return by inspection.

## Why
PRD 0001 R3 (AC 37, 38), the packaged shell approved for R3 in ADR 0001, and the OpenTelemetry
decision moved to R3 (SPEC 0004). Plan and owner answers: `.engineos/changes/2026-11-19-r3-plan.md`.

Risk high (SPEC 0006 header): a SQLite migration (authored only), a `qualityScore` formula change,
an untrusted CSV upload, runs started without a click that can spend money, and a new `run.json`
writer rule. `security_review` stays pending until the final gate.

## Ticket ledger
| Ticket | Scope | Blocked by | State |
|---|---|---|---|
| R3-01 | `packages/shared/**`, `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md` | - | integrated (DEGRADED: not compiled) |
| R3-02 | core metrics, migration, quality v2 (fills `platformSignal`, `qualityPlatformSampleSize`) | R3-01; parser profiles also wait for the owner's header rows (Q7) | integrated (DEGRADED: not compiled) |
| R3-03 | core schedules, paths, run-draft factory and input (widens `packages/core/src/runs/run-draft.input.ts:21` createdBy) | R3-01 | integrated (DEGRADED: not compiled) |
| R3-04 | watcher schedule step | R3-01, R3-03 | planned |
| R3-05 | api routes | R3-01, R3-02, R3-03 | planned |
| R3-06 | web (also pt-BR texts for `apiRev5ErrorReasons`) | R3-01 | integrated (DEGRADED: not compiled) |
| R3-07 | CLI | see SPEC 0006 section 10 | planned |
| R3-08 | Electron menu-bar shell | ADR 0005 answered (Q1) | planned |
| R3-09 | OTLP file export | R3-01, R3-07 | planned |
| R3-FP | final proof | owner approval at the final gate | planned |

## Checklist
- [x] R3-01 integrated (backend-coordinator, opus, 14m51s, OK; inspected by the supervisor)
- [x] Wave 2: R3-02, R3-03, R3-06 integrated; contract gap closed
- [ ] Wave 3 and later (super-dev run: R3-04, R3-05, R3-07, R3-08, R3-09)
- [ ] Closing code review and one fix pass
- [ ] Final checks (owner approval at the final gate)

## Integration notes
- R3-01: about 25 files in `packages/shared/src/{metrics,schedules,schedules/files}`, api `metrics.ts`/`schedules.ts`, edits to ids, quality-score (v2, `platform: 0.3`), asset-version, run-file (`RunCreatedBySchema` adds `watcher`, `schedule` link required exactly for watcher runs, `format` stays 1), api common (rev 5), runs, routes, package exports; RUN-FORMAT sections 4, 8, 24; ADR 0003 writer rows. Inspection: no `node:` imports outside `schedules/files/`; no `any`/`as`; formula v2 adds no term when `platformSignal` is null (`catalog/quality-score.ts:87-89`); schedule paths checked as ULID under an absolute `schedules` root (`schedules/files/paths.ts:27-55`); CSV bounds 2 MiB, 5,000 rows, 64 columns; `csvSafeCell` guards `= + - @ \t \r`.
- Accepted deviations: `platformSignal` lives in `metrics/platform-signal.ts`, re-exported from quality-score; `nextSlots` takes an options object; create request accepts `briefMode: 'queue'` only (file enum keeps `repeat`); the spec's `RunView` does not exist, so `RunIndexEntryView`/`RunStateResponse` gain optional fields; extra view fields `baselineReady`, `used`.
- Provisional (Q7): `packages/shared/src/metrics/provisional-column-aliases.ts`; TikTok id column `Video link` is a placeholder.
- Supervisor fix: `packages/core/src/runs/run-index.mapper.ts:67` uses `RunCreatedBySchema`.
- R3-03 (backend-coordinator, opus, 12m16s, OK): `packages/core/src/schedules/**` (about 30 files, 1,155 lines), `paths/data-home.ts` (`DataHome.schedules`, created at boot), `runs/run-draft.factory.ts` and `run-draft.input.ts` (`RunCreatedBySchema`, optional `initialStatus`, `schedule` link required exactly for watcher runs). Inspection: `SchedulesReadModule` provides no handler and no writer (`schedules-read.module.ts:21-23`); the 4 handlers sit in `SchedulesModule` only; no Prisma create/update/delete in scope; `decideSlot` (`slot-decision.ts:74-93`) skips with `month-spend-unavailable` before any fire when the month figure or ceiling is unknown; the factory produces `pending` only. Accepted deviations: create refusal order follows the frozen contract text (`api/schedules.ts:26-31`) over spec 5.5; one `PatchScheduleCommand` for the single PATCH route; extra exports for R3-04/R3-05 (`dueSlotSplit`, `SlotFactsCollector`, `ScheduleRunsReader.findRunForSlot`, `ScheduleStore`).
- R3-02 (backend-coordinator, opus, 13m13s, DEGRADED until the catalog fix below): migration `20261119120000_r3_outside_signals` (3 CREATE TABLE, 3 indexes, 1 ADD COLUMN; additive, authored only), `schema.prisma` (3 models, `AssetVersion.qualityPlatformSampleSize`), `packages/core/src/metrics/**` (26 files), `quality/**` (platform signals, v2 fill-in, trigger `metrics`), `package.json` exports `./metrics` and `./schedules`. Inspection: no `@studio/shared/schedules` import, no outbound request, no `active` write, no raw SQL, `MetricsModule` absent from the watcher; logs carry ids and counts only. Accepted deviations: Prisma `BigInt` for the 9 count columns over SQL `INTEGER` (1e12 bound; same SQLite affinity, values re-validated through the shared schema); 400-snapshot limit enforced on the form only; a cut cell skips its row; "today" is the Mac's local date; removing a publication does not rescore.
- Supervisor fix: `packages/core/src/catalog/asset-version.mapper.ts:70,106` and `asset-version.factory.ts:122` fill `qualityPlatformSampleSize` (without it every catalog read failed `AssetVersionSchema`).
- Contract gap closed (supervisor): `packages/shared/src/api/common.ts` `apiRev5ErrorReasons` gains `invalid-schedule-input` 422, `schedule-brief-change-refused` 409, `schedule-file-corrupt` 500, `invalid-metrics-input` 422, `metrics-snapshot-limit-reached` 422, `metrics-row-corrupt` 500; pt-BR texts in `apps/web/src/features/common/api-error-text.ts` (the `Record<ApiRev5ErrorReason, string>` type keeps them in step); core error comments refreshed. Additive to the frozen contract (rev stays 5).
- R3-06 (frontend-coordinator, opus, 17m39s, DEGRADED: not compiled): `apps/web/src/features/{metrics,schedules}/**`, pages `agendamentos`, `agendamentos/[scheduleId]`, `metricas/importar`, quality v2 labels with both counts, BFF route table PATCH/DELETE with a per-route body limit (import capped at 2 MB plus 64 KiB framing), run page "Publicações" card on approved runs, navigation links. Inspection: no `dangerouslySetInnerHTML`; no `any`/`as`; no approve, promote or publish control; no env or secret reads; publication links rebuilt as https and opened with `noopener noreferrer`; largest file 202 lines. Accepted deviations: promotion and comparison screens show the run count only (their payloads carry no platform count; R3-AC-07 partly covered, contract follow-up); no UI for adding or removing queued briefs (5.7 lists queue, pause, resume, delete only).

## Human decisions
2026-11-19 | Ricardo Fagmer | "Start wave 1" (R3-01 contracts) | approved | this record
2026-11-19 | Ricardo Fagmer | prototype preview choice for SPEC 0006: "No preview (Recommended)" | declined | this record
2026-11-19 | Ricardo Fagmer | "Start wave 2" (R3-02, R3-03, R3-06 in parallel; R3-06 starts without a preview, as declined) | approved | this record
2026-11-19 | Ricardo Fagmer | /super-dev for the rest of R3: "git init, then super-dev (Recommended)": after R3-06 integrates, `git init` in video-studio/ only (ricardo-clone/ stays outside), `git add -A`, one baseline commit after the secret scan, each git write asked once; then super-dev prepare, review and run for R3-04, R3-05, R3-07, R3-08, R3-09; supersedes the earlier "No git" choice for this work | approved | this record
