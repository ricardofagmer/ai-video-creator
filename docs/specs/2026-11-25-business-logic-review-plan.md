# Business logic review and cleanup plan

Date: 2026-11-25. Status: proposed, not started. Source: three read-only audits of `video-studio`
(run pipeline; catalog and assets; publishing, platforms and infra) plus the sibling folders.

## Findings in one paragraph

The code is clean at the file level: every non-test source file has an importer, every API route
has a web caller, and every Prisma model and sampled column is read. The waste is elsewhere:
(1) about 24 GB of stale build output and merged worktrees on disk; (2) one dead CLI layer
(`pnpm ace`); (3) copy-pasted infrastructure (locks, cost ledgers, plist, upload limits);
(4) background state that only reaches SQLite when someone opens a page; (5) an improvement loop
(curation, comparison, promotion) split across three modules with about six manual steps; and
(6) about ten overlapping ways to categorise an asset.

## Current flows (as built)

- **Run:** recipe version (draft, active, deprecated) -> run draft -> pending -> watcher
  `RunEngine` walks 14 stages x 7 steps -> `review` -> owner decision writes
  `RunOutcome` and recomputes quality over the whole catalog -> learnings, promote-from-run,
  save-video.
- **Improve:** Curator proposal -> save draft -> create comparison -> start -> review A ->
  review B -> open the version page -> promote (evidence optional).
- **Asset:** upload, link or reference -> immutable `AssetVersion` -> three jobs enqueued from
  the HTTP save only (reference analysis, template preview, purpose) -> watcher writes job and
  cost files -> API copies results into SQLite when a page reads them.
- **Publish:** request -> watcher uploads -> `PublishAttemptSync` links the publication at boot
  or on a read -> watcher polls metrics into an inbox -> `MetricInboxSync` ingests at boot or on a
  read -> metrics feed only the quality score, not `/indicadores`.

## Wave 0 - Reclaim disk (no code change, needs owner confirmation)

Status 2026-11-25: done, except `ai-creator-engine`. The owner approved it, and about 19 GB
was freed. 12 of the 13 `previous-install*` folders, the old `Video Studio` bundle and three
stale `.next.*` folders were deleted. `previous-install-20261124222740` is kept as a rollback
copy. Both worktrees and their branches were removed. `ai-creator-engine` waits for its unsaved
work to be rescued.

| Item | Size | Action | Notes |
|---|---|---|---|
| `apps/shell/out/previous-install*` (about 13 folders) | about 18-22 GB | delete | Nothing in the code writes them. Keep the newest one if a rollback copy is wanted. |
| `apps/shell/out/Video Studio-darwin-arm64` | 258 MB | delete | Old product name, Nov 19 |
| `apps/web/.next.dev-230140`, `.next.dev-230802`, `.next.build-231108` | about 1.2 GB | delete | Never touch the live `.next` used by the 4320 dev server |
| `video-studio-deps` worktree (`chore/deps-audit-fixes`) | 1.5 GB | `git worktree remove` and delete the branch | Already merged into HEAD |
| `video-studio-zod4` worktree (`chore/zod4-migration`) | 1.6 GB | `git worktree remove` and delete the branch | Already merged, clean tree |
| `ai-creator-engine` repo | 892 MB | archive **after** rescuing its unsaved work | 5 modified toolbox files, `docs/adr/0004-local-cloned-voice-engine.md`, `docs/specs/0003-owner-clone*.md` (renumber them on import), and its newer `local-voice.ts` |
| `ricardo-clone` | 4.5 GB | keep | Holds the owner voice clone |

## Waves 1 and 2 status

Status 2026-11-25: implemented and integrated, but not yet checked (the owner skipped the checks).
The change record is `.engineos/changes/2026-11-25-business-logic-waves-1-2.md`.

- `API_CONTRACT_REVISION` is now 8.
- The 12 `ace` seed skills and 10 orphaned toolbox files are removed. Git keeps them in commits
  `c52a849` and `bffdab4`.
- The `ai-creator-engine` copy of `local-voice.ts` is **older** than the one removed here, which
  added `fileInputArgs`, so nothing from it needs rescuing.
- Deferred:
  - The plist single source (the owner chose to keep both copies).
  - The `@studio/ui` exports and the `VoiceSampleAudio` rename, because another session owns them.
  - Renaming promote-from-run to "Save as version".

## Wave 1 - Remove dead code (low risk, one PR)

| Item | Evidence |
|---|---|
| `ace` CLI in `packages/toolbox`: `cli.ts`, `cli/`, top-level `commands/*.ts` (keep `commands/media`), `run/`, `qa/`, then `hooks/` after a second check; drop the root `"ace"` script | The watcher imports only `errors`, `media`, `commands/media`, `providers`, `encoding`, `narration` and `render/static-server`. About 3,200 lines. Keep `validation/`. |
| `SetRecipeStatusResult.replaced` (always `null`), and the same field on catalog version status | `recipes/commands/set-recipe-status.command.ts:14`, `shared/src/api/recipes.ts:33` |
| Narrow PUT status bodies to `deprecated` | `shared/src/api/catalog.ts:329` accepts statuses that are always rejected |
| `hasContentSignature` | `core/src/catalog/content-signature.ts:64`, used only by its test |
| `GET /metrics/imports` | `metric-imports.controller.ts:79` has no caller. Keep it only if a history view is planned. |
| `@studio/ui` exports `formatRelative`, `PageHeader`, `AssetCard` | 0 importers |
| Mock JPEG `site-screenshot.placeholder.ts` in the live executor folder | Move it to test support |
| Stale text: comment at `catalogo/page.tsx:205`; the "CLI indexes the file" claim at `asset-job-cost.service.ts:17` | Both are false today |

## Wave 2 - Remove duplication (low to medium risk)

1. One keyed in-process mutex in `core/src/runtime`. It replaces `review/run-locks.ts`,
   `comparisons/comparison-locks.ts` and about 15 inline copies.
2. One cost-ledger module, parameterised by source (run, curation, asset job). It replaces the
   three mirrored cost-file, ledger and mapper files.
3. One `REVIEWABLE_RUN_STATUSES` constant. It replaces three literal lists.
4. One launchd plist source. The shell imports the template that `install.sh` uses.
5. Upload limits move to `@studio/shared/catalog`. The web stops mirroring
   `catalog.limits.ts` by hand.
6. Resolve the name collisions `CatalogCategory` (two meanings) and `VoiceSampleAudio`
   (two meanings).
7. One "save run artifact" service behind promote-from-run and save-video, which repeat the same
   load, watcher check, biometric guard, hash check and provenance. Rename promote-from-run to
   **Save as version**.

## Wave 3 - Close the background loops (main process enhancement)

The rule: state that the watcher produces reaches SQLite on its own, not when someone opens a page.

1. Add one API **sync scheduler** (a timer, about 30 s) that drives the existing syncs:
   `PublishAttemptSync`, `MetricInboxSync`, `RunIndexSync`, `AssetPurposeSync` and
   asset-job cost indexing. Keep the read hooks as a fast path. GET requests then stop writing.
2. Add a core **version-created event**. Every new `AssetVersion` (HTTP save, promote, save-video,
   CLI seed) enqueues purpose, preview and analysis jobs. Then drop the 2-minute
   `TemplatePreviewBackfill` interval (keep the boot pass), and keep the purpose backfill button
   only for old data.
3. Index the costs of asset-purpose and template-preview jobs. Today they never reach
   `cost_entries`.
4. Feed `platform_metric_snapshots` (views, engagement) into `/indicadores`.
5. Store API-pulled snapshots as `source='api'`. Today they are labelled `csv`.
6. Make the quality recompute incremental, or guard it across processes, so the CLI `rescore`
   cannot overlap it.

## Wave 4 - Simplify the improvement process (needs product decisions)

1. **One improvement lifecycle:** proposed -> compared -> decided -> activated, covering curation,
   comparison and promotion. The comparison gets a **Decide** step that promotes the winner and
   attaches the evidence (`runIds` plus `comparisonId`) automatically. Manual steps go from about
   six to three.
2. **Save and promote** in one action from a run (optional).
3. **Block save-video on rejected runs.**
4. **Wizard reuses matching recipe variants** through `variant-recipe.service.ts`, instead of a new
   draft each session. Then merge the two compose rules into one.
5. **Learnings follow a version lineage.** Notes carry over when a version is promoted or curated.
6. **agent-review stage:** it never blocks a run and costs one model call. Fold its score into the
   qa report, or turn it off by default.
7. **One run-creation UI and one progress view** (`/criar` wizard and `/execucoes/nova` today).
8. **Curator on the Claude Code engine:** support it, or hide Curator with a clear message when that
   engine is active. Today every curation fails at the call.

## Wave 5 - Simplify categorisation (medium risk, needs a data migration)

1. One category concept per kind, using the `cat.*` tag convention, plus free tags. It replaces
   sections, subKind splits, template, image, custom and skill categories, the music category list
   and `ImageDetails.purpose`.
2. Category display names move from browser cookies into `Setting`.
3. A server-side `subKind` filter fixes short pages and wrong counts in Sites and References.
4. Make `purpose` searchable (lexical first, embeddings later).
5. Define the text fields: `summary` (what it is), `purpose` (what it is for), `notes` (owner
   only). Drop the overlapping uses.

## Wave 6 - Infra and developer experience

1. CI also covers `@ace/*`, and one Node version is pinned across CI, engines and the bundled
   runtime.
2. One setup step manifest and `studio doctor` shared by `install.sh`, the shell setup and the
   API install probes.
3. Document live platform mode, the OAuth secret names and the mock-fault variables in an
   `.env.example`.
4. Rename `apps/api/src/platform` to `http`, and rename the `rev7-*` tests by behavior.
5. Document `scripts/e2e/run-pipeline.sh`.
6. Restore the 4 missing seed music files, or remove them from `catalog.seed.json`.

## Product decisions

- 2026-11-25, owner: start with Wave 0.
- 2026-11-25, owner: **park** the portal and pairing code (about 3,000 lines, dormant until the
  portal is deployed). Do not delete it.
- 2026-11-25, owner: **fold agent-review into qa** (Wave 4 item 6).
- Open: keep both render engines (Remotion and HyperFrames) under one composition stage?

## Order and gates

Do Wave 0 first: it needs only confirmation. Waves 1 and 2 are refactors with no behavior change.
Waves 3 to 5 change behavior, so each gets its own spec and tickets. Wave 5 needs a migration
plan. The current `feat/catalog-image-library` branch has 44 uncommitted changes, so land or
park it before Wave 1 starts.
