# Plan: catalog asset purpose

Status: rev 1, frozen (owner, 2026-11-25).
Sources: PRD `docs/prds/2026-11-25-catalog-asset-purpose.md`, ADR `docs/adr/0012-asset-purpose-text.md`.
Checkout: `video-studio` only, branch `feat/catalog-image-library` (current branch kept).
Risk: **high**, because of the biometric policy amendment (ADR 0012 decision 5) and new model
egress. Autonomy ceiling: A3. Human gate: ADR 0012 approved by the owner on 2026-11-25.
Rollback: revert the commits, then drop the two columns with a down migration. The scanner ignores
leftover `asset-purpose` job files.

## Surfaces

| Layer | Path | Change |
|---|---|---|
| DB | `packages/core/prisma/schema.prisma`, new migration `2026112513xxxx_asset_purpose` | `purpose TEXT NOT NULL DEFAULT ''`, `purpose_source TEXT NOT NULL DEFAULT 'none'` on `asset_versions` |
| Shared contract | `packages/shared/src/catalog/asset-version.ts`, `packages/shared/src/api/catalog.ts`, `packages/shared/src/asset-jobs/asset-job.ts` | fields, view, job kind, routes (C-P1..C-P3) |
| Core catalog | `packages/core/src/catalog/` mapper, repository, `save-asset-version.handler.ts` (from-previous copy), new `commands/set-asset-purpose.*`, new `asset-purpose.sync.ts` | owner edit, job-to-row copy |
| Core jobs | `packages/core/src/asset-jobs/` new `asset-purpose-request.ts`, `asset-purpose.enqueuer.ts`, policy entry, backfill query/command | enqueue, backfill |
| Core agents | `packages/core/src/agents/asset-purpose-writer/` (definition, service, prompt in `agents/prompts/asset-purpose.prompt.ts`, mock) | the writer agent, same model and engines as reference-analyst |
| Watcher | `apps/watcher/src/asset-jobs/asset-purpose.handler.ts`, `asset-purpose.input.ts`, module wiring | runs the job |
| Api | `apps/api/src/catalog/asset-purpose.controller.ts` (new), wiring in the existing catalog module | 4 routes |
| Agent tools | `packages/core/src/agents/tools/catalog-search.tool.ts`, `asset-describe.tool.ts` | return `purpose` |
| Web | `apps/web/src/features/catalog/components/CatalogAssetItem.tsx`, `CatalogLibraryTile.tsx`, new `AssetPurposeCard.tsx`, `views/AssetDetailView.tsx`, catalog page backfill button + dialog, `apps/web/src/messages/catalog/{pt-BR,en,es}.ts` | UI |

## Frozen contracts (rev 1)

**C-P1, version fields** (`assetVersionBaseShape`):
- `purpose: z.string().max(280)`, default `''`.
- `purposeSource: z.enum(['none', 'ai', 'owner'])`, default `'none'`.
- Not part of `AssetMetadataInputSchema`: an upload never sets them.

**C-P2, view** (`AssetVersionView` adds):
- `purposeJob: null | { status: 'requested' | 'running' | 'failed' | 'refused', errorCode: AssetJobErrorCode | null }`
- `null` means no open or failed job. A `done` job is already copied into `purpose`.

**C-P3, job**: `AssetJobKindSchema` gains `'asset-purpose'`. On `done` the job file carries
`mode`, `promptVersion` and `purpose` (validated as C-P1 `purpose`, min 1). Error codes come only
from the existing `AssetJobErrorCodeSchema`.

**C-P4, routes** (under `apiRouteSegments.catalogAssets`, owner session, same guards as the existing catalog routes):
- `PUT  :assetId/versions/:version/purpose`, body `{ purpose: string 1..280 }`. Sets `purposeSource: owner`. Returns the version view.
- `POST :assetId/versions/:version/purpose/generation`, no body. Sets `purposeSource: none` and enqueues. Returns 202 with the view. 409 when a job is already open.
- `GET  purposes/backfill`, returns `{ missing: number }`.
- `POST purposes/backfill`, returns `{ requested: number, failed: number }`.

**C-P5, i18n keys** under `catalog.purpose`: `heading`, `pending`, `failed(code)`, `refused(code)`,
`retry`, `regenerate`, `edit`, `save`, `cancel`, `empty`, `ownerEdited`, `backfillButton(count)`,
`backfillConfirmTitle`, `backfillConfirmBody(count)`, `backfillDone(count)`. Ticket 01 owns them
in all three locales. pt-BR is the source text.

**C-P6, model input builder** (`apps/watcher/src/asset-jobs/asset-purpose.input.ts`):
- `biometricPurposeInput(version) → { name, kind, tags }`. Nothing else is read.
- `purposeInput(version, content)` for every other row, with content bounded at 12 000 chars of
  text or one image ≤ 5 MB.

## Acceptance (EARS)

- **AP-01** When `create`, `saveVersion` or `registerByReference` succeeds, the api shall enqueue one `asset-purpose` job for that version. A failed enqueue shall leave the save successful and log `asset-job.enqueue-failed` with the ref and code only.
- **AP-02** When an `asset-purpose` job is `done` and the row's `purposeSource` is not `owner`, the api shall copy its text into `purpose` with `purposeSource: ai` on the next read of that version.
- **AP-03** When the row's `purposeSource` is `owner`, the api shall not overwrite `purpose` from any job.
- **AP-04** The writer shall return 1 to 280 chars of plain pt-BR text. Output that is longer, empty, contains markup or fails redaction shall end the job as `failed` / `provider-error`.
- **AP-05** For a `biometric` version, the model input shall contain only name, kind and tags. It shall never contain a path, hash, bytes, summary, notes or details.
- **AP-06** For prompt and skill versions the input shall include the bounded entry text (amended 2026-11-25, owner: templates are metadata only until a template entry file is defined). For stored images it shall include the image. For video references with a `done` analysis it shall include that analysis. For music, SFX and link-only rows it shall be metadata only.
- **AP-07** Live mode shall check the month ceiling and write egress lines as reference analysis does. Mock mode shall write a labelled stand-in and spend nothing.
- **AP-08** A `from-previous` version shall copy `purpose` and `purposeSource` from its source and enqueue no job. Amended 2026-11-25 (owner): a `from-previous` version with a new entry file writes new bytes, so it inherits nothing and enqueues one `asset-purpose` job (ADR 0012 decision 6).
- **AP-09** The detail page shall show the purpose text. While `purposeJob` is `requested` or `running` it shall show the pending text. While it is `failed` or `refused` it shall show the reason and a Retry button that calls the generation route.
- **AP-10** The owner shall be able to edit (PUT) and regenerate (POST generation) the purpose from the detail page. An owner text shall show the `ownerEdited` mark.
- **AP-11** Every catalog square (grouped grid card and library tile) shall carry `title` = purpose, falling back to the name. Its thumbnail `img` shall carry `alt` = purpose, falling back to the existing alt text.
- **AP-12** `GET purposes/backfill` shall count the latest and active versions with `purposeSource: none` and no open job, with no duplicates. `POST` shall enqueue exactly those. Amended 2026-11-25 (owner): a version whose job is already `done` is not counted, since its text is copied on the next read. When the queue is full, the result's `failed` count shall be shown with a note to try again later (`backfillQueueFull(count)`, added to C-P5).
- **AP-13** The catalog page shall show the backfill button only when `missing > 0`. Clicking it shall open a confirmation dialog with the count, and nothing shall be enqueued before the owner confirms.
- **AP-14** `CatalogSearchTool` rows and `AssetDescribeTool` output shall include `purpose`, bounded and redacted like `summary`. Biometric rows shall stay excluded.

## Risks
- Prompt injection from asset text. Mitigation: content is wrapped as data in the prompt and the output is validated (AP-04). The tool-less agent has nothing to call.
- Backfill cost. Mitigation: a confirmation with the count (AP-13) plus the existing month ceiling (AP-07).
- Copy-on-read race between two reads. Mitigation: a conditional update `WHERE purpose_source <> 'owner'`, which is idempotent.
