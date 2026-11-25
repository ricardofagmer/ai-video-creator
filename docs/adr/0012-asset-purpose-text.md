# 0012. AI-written purpose text for catalog asset versions

Date: 2026-11-25
Status: accepted (owner, 2026-11-25).

Decider: Ricardo Fagmer. Sources: the owner's request and grilling answers of 2026-11-25
(recorded in `.engineos/changes/2026-11-25-catalog-asset-purpose.md` under Human decisions);
ADR 0003; the code read on branch `feat/catalog-image-library` at `66c663b` plus the working tree.

Amends ADR 0003 decision 2 (biometric rows are never agent-readable) with one narrow exception.
It does not replace ADR 0003.

## Context

- Catalog cards show a name, kind, tags and a thumbnail. Nobody can tell what an asset is for
  without opening it (owner, 2026-11-25).
- `AssetVersion.summary` (max 200 chars) exists. The owner types it, it is optional, and no page
  shows it. It already feeds `CatalogSearchTool` and `AssetDescribeTool` (**Fact**).
- Asset jobs already exist: the api writes a `requested` job file, the watcher claims and runs it
  and writes the result into the same file (`packages/shared/src/asset-jobs/asset-job.ts`,
  `apps/watcher/src/asset-jobs/`). Kinds today: `voice-sample`, `reference-analysis`,
  `template-preview` (**Fact**).
- ADR 0003: the watcher reads SQLite and never writes it. `CatalogReadModule` registers no command
  handler for that reason (**Fact**, `packages/core/src/catalog/catalog-read.module.ts`).
- The reference analyst is a tool-less agent on `SONNET_MODEL_ID`, run by the watcher, priced
  against the month ceiling, and it supports the Claude Code engine of ADR 0011 (**Fact**).
- ADR 0003 decision 2: `sensitivity: biometric` rows are excluded from exports and from
  agent-readable context (**Fact**).

## Decision

1. **Field.** Every asset version gets a `purpose` text: 1 to 2 sentences, max 280 chars, plain
   text, pt-BR. It also gets a `purposeSource`: `none` | `ai` | `owner`. `summary` stays as it is.
   The image kind's `details.purpose` enum (logo, still, ...) is unrelated and stays.
2. **Purpose is an annotation, not version content.** It may change after the version is saved,
   like the quality score. Changing it never creates a new version and never changes
   `contentHash`.
3. **Generation is a new asset job kind, `asset-purpose`.** The api enqueues it after `create`,
   `saveVersion` and `registerByReference`. A failed enqueue never fails the save. The watcher runs
   a new tool-less agent, `asset-purpose-writer`, with the reference analyst's model, engines,
   month-ceiling check and egress lines. Mock mode writes a labelled stand-in.
4. **The api copies results into SQLite.** The watcher writes the text into the job file only. The
   api copies a `done` job's text into `asset_versions.purpose` with `purposeSource: ai` when it
   reads that version (catalog list, detail, the purpose route). It skips the copy when
   `purposeSource` is `owner`. ADR 0003's rule that the watcher never writes SQLite holds.
5. **What the model may read.** Normal and third-party versions: name, kind, tags, summary and
   details, plus readable content. Readable content means text of prompts, skills and templates
   (entry file, bounded), a stored image's pixels, and the `done` reference analysis of a video
   reference. Music, SFX, link images, site links and video links give metadata only. **Biometric
   exception:** the model receives name, kind and tags only. It never receives a path, hash, file,
   summary, notes or details. A dedicated input builder enforces this, and nothing else may build
   the prompt for a biometric row.
6. **Versions.** A version with new bytes gets a new job. `from-previous` copies `purpose` and
   `purposeSource` from its source version and enqueues nothing.
7. **Owner control.** The owner may edit the text (`purposeSource: owner`) or ask for a new
   generation. Regenerating an owner text resets it to `none` and enqueues a job. No automatic path
   overwrites an owner text.
8. **Agents.** `CatalogSearchTool` and `AssetDescribeTool` return `purpose`, bounded and redacted
   like `summary`. Biometric rows stay excluded, as they are today. The semantic index does not
   change.
9. **Backfill** is an owner action on the catalog page. It covers each asset's latest version and
   its active version where `purposeSource` is `none` and no job is open. A confirmation that shows
   the count comes first.

## Alternatives

1. **The watcher writes `purpose` into SQLite.** Rejected: it breaks ADR 0003, and it would put a
   catalog command handler in a root that must stay read-only.
2. **Keep the text only in the job file and read it on every list.** Rejected: agent tools read the
   catalog through SQLite queries, and search, sort and backfill counts would each need a file scan.
3. **Reuse `summary`.** Rejected by the owner: AI text and owner text would mix, and the 200-char
   cap is too small.
4. **Generate inside the save request.** Rejected by the owner: a model outage would slow down or
   block registering.
5. **Biometric: no AI, owner types it.** Considered and rejected by the owner, who accepted the
   name/kind/tags exception.

## Consequences

- One Prisma migration: two columns with defaults and no data rewrite. Rollback: drop the columns
  and the job kind. Job files of the unknown kind are then ignored by the scanner.
- New model egress: each new version, regeneration and backfill item is one model call, priced and
  limited by the existing month ceiling.
- Biometric metadata (name, kind, tags) now reaches the model. The owner accepts this, and the
  narrow builder plus a test keep it from growing.
- Asset content is untrusted input to the model. The output is checked: plain text, ≤ 280 chars,
  HTML stripped, redacted. Anything else counts as a `provider-error` failure.
- `video-studio-deps` and `video-studio-zod4` get this when they are rebased (owner, 2026-11-25).
