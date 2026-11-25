---
name: 2026-11-25-catalog-asset-purpose
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-25-catalog-asset-purpose.md
domain: general
security_review: pending
preview: declined
risk: high
new_feature: true
release: false
---

## What
Every catalog asset version gets an AI-written "purpose" text (1 to 2 sentences, max 280 chars,
pt-BR). The detail page shows it, and the catalog square shows it on hover through `title` and `alt`.

## Why
Asset names often say nothing, so the owner has to open each asset to learn what it does
(owner, 2026-11-25).

## Scope
Branch `feat/catalog-image-library`, checkout `video-studio` only. Surfaces are listed in
`.specs/features/catalog-asset-purpose/plan.md`: Prisma migration, shared contracts, core catalog and
asset jobs, a new `asset-purpose-writer` agent, watcher handler, api routes, agent tools, web UI and
i18n.

## Checklist
- [x] 01-purpose-tracer-bullet (implemented, not yet verified)
- [x] 02-purpose-content-readers (implemented, not yet verified)
- [x] 03-purpose-owner-edit (implemented, not yet verified)
- [x] 04-purpose-hover-and-copy (implemented, not yet verified)
- [x] 05-purpose-backfill (implemented, not yet verified)
- [x] 06-purpose-agent-tools (implemented, not yet verified)
- [ ] 07-final-proof (after final-checkpoint approval)

## What was made
- Prisma migration and `purpose` / `purposeSource` columns; shared contracts C-P1..C-P5.
- `asset-purpose-writer` agent (prompt `asset-purpose@2`, content in `<untrusted>` blocks, JPEG image part), watcher handler with content readers (text, image, reference analysis) and biometric name/kind/tags-only input.
- Copy-on-read sync into the row unless `purposeSource: owner`; enqueue after create, save and register; from-previous inherits unless a new entry file is written.
- Api routes: PUT purpose, POST generation, GET/POST backfill.
- Web: detail page purpose card with pending/failed/Retry, owner editor and Regenerate; `title` and `alt` on catalog cards and library tiles; backfill button with confirm dialog and queue-full note.
- Agent tools `CatalogSearchTool` and `AssetDescribeTool` return a redacted, bounded `purpose`.
- Takeover (2026-11-25, this session): hover popover on every catalog card and Images library tile, replacing the `title` tooltip (`CardHoverPopover`, `CatalogPreviewHover`, `purpose-text.ts`). Per kind: image picture, video reference poster frame, site favicon plus domain, prompt/skill first lines, music/SFX waveform badge with duration, brand-kit swatches, glyph otherwise; name plus purpose (pending note, then summary, then empty text as fallbacks). Templates keep their clip on the same shell, with purpose before the category description. `alt` texts kept. The `display: contents` wrapper is gone.
- Music catalog cards get the `MusicPreviewButton` play button (owner request, 2026-11-25).

## Not done
- Lint, typecheck, build, tests (AP-01..AP-14), browser walk: awaiting final-checkpoint approval.
- Migration run on the dev database: awaiting scoped confirmation.
- Security review and critic pass: awaiting separate consent.
- Known risks: pending spinner can show after an owner edit while a job is open; markup regex in 2 copies; Claude Code client withholds PNG/WebP images; egress `bytes` overcounts a withheld image; stale doc comment in `asset-purpose.handler.ts`.

## User checklist
- [x] Approve the final checkpoint: "test it" (2026-11-25) covered typecheck and the browser walk. Lint, build and unit tests were not run.
- [ ] Consent separately to the security review.
- [x] Confirm the migration run on the dev database: "Backup, then migrate" (2026-11-25).
- [ ] Rebase `video-studio-deps` and `video-studio-zod4` later to receive the feature.

## Verification
Earlier the final checkpoint was skipped. The owner later asked "test it" (2026-11-25), and this run covered:
- ran: typecheck with turbo over `@studio/web`, `@studio/api`, `@studio/core` and `@studio/watcher` (2026-11-25). The new purpose fields broke 4 test fixtures; they are fixed. Errors that already failed at HEAD remain and were not touched:
  - core: 18 errors in catalog.test, recipes.test, runs.test, slot-decision.test and seed.test;
  - api: `src/__tests__/session.test.ts(100,51)`;
  - watcher: RecordingHyperframesPorts/renderRuntime, RealFolder and parsePictureProbe/pictureMismatches.
- ran: `prisma:migrate:deploy` on the dev DB `~/Library/Application Support/VideoStudio/db/studio.sqlite` (2026-11-25), after a `sqlite3 .backup` to `studio.sqlite.bak-20261125` (64 asset_versions). Migration `20261125130000_asset_purpose` applied.
- ran: browser walk in Chrome at `http://127.0.0.1:4310/catalogo` (2026-11-25). A hover popover with name plus purpose appeared in all 7 sections:
  - References: poster thumbnail, or glyph;
  - Sites: favicon plus domain;
  - Video templates: 9:16 clip, or glyph;
  - Images: picture;
  - Prompts: first lines;
  - AI & writing: glyph for models, first lines for skills;
  - Media & brand: waveform plus duration, and swatches.

  The popover renders above the catalog dock. The music "Listen" button played `spesia-music-680` (currentTime 1.7 s, label "Pause") and paused again.
- Not run: lint, build, unit tests.
Security review declined (2026-11-25); `security_review: pending`, so PR create/merge stays blocked.

## Human decisions
- 2026-11-25 | Ricardo Fagmer | — | approved | "Take over here": this session finishes the catalog-asset-purpose work. Hover popover per kind (image, poster frame, favicon plus domain, first lines, waveform, swatches, name plus purpose) replaces the AP-11 `title` tooltip; music play button on catalog cards.
- 2026-11-25 | Ricardo Fagmer | grilling Q1-Q19 | approved | New `purpose` field; background job after save; backfill via button with count confirm; biometric gets name, kind and tags only; metadata plus readable content; per version; owner edit plus Regenerate; pt-BR only; `title` on card plus `alt` on thumbnail; max 280 chars; status plus Retry; third-party treated as normal; agent tools return purpose; reference-analyst model; latest plus active versions.
- 2026-11-25 | Ricardo Fagmer | policy-conflict | approved | Build in `video-studio` only; `video-studio-deps` and `video-studio-zod4` get it on rebase (replaces the Q17 "all three checkouts" answer).
- 2026-11-25 | Ricardo Fagmer | high-risk | approved | ADR 0012 accepted, including the biometric name/kind/tags exception to ADR 0003 decision 2.
- 2026-11-25 | Ricardo Fagmer | high-risk | approved | PRD accepted and plan frozen at rev 1.
- 2026-11-25 | Ricardo Fagmer | high-risk | approved | 7 tickets and their blocking edges approved.
- 2026-11-25 | Ricardo Fagmer | — | declined | Prototype preview: "No preview, implement" (scope plan-rev1).
- 2026-11-25 | Ricardo Fagmer | policy-conflict | approved | "New AI job (Recommended)": a from-previous version with a new entry file enqueues a purpose job and inherits nothing (AP-08 amended, matches ADR 0012 decision 6).
- 2026-11-25 | Ricardo Fagmer | — | approved | "Metadata only for now (Recommended)": templates send no entry text to the writer (AP-06 amended).
- 2026-11-25 | Ricardo Fagmer | — | approved | "Skip done jobs (Recommended)": backfill does not count a version whose purpose job is already `done` (AP-12 amended).
- 2026-11-25 | Ricardo Fagmer | — | deferred | Final checkpoint: "Skip for now". No lint, typecheck, build, tests or browser walk run.
- 2026-11-25 | Ricardo Fagmer | high-risk | declined | Security review: "Decline review". No security-reviewer, critic or scan run; `security_review` stays pending.
- 2026-11-25 | Ricardo Fagmer | destructive-action | approved | "Backup, then migrate (Recommended)": the dev DB was backed up, then migration `20261125130000_asset_purpose` was applied.
- 2026-11-25 | Ricardo Fagmer | — | approved | "You retry the kill": the old API process (pid 16141) that held the DB lock was stopped.
- 2026-11-25 | Ricardo Fagmer | — | approved | "Press again, add note (Recommended)": queue cap of 10 kept; the result shows the not-queued count via new i18n key `backfillQueueFull` in pt-BR, en, es.

## Changes registered
Filled on completion.

## Notes
- Base-level `purpose` is unrelated to the image kind's `details.purpose` enum.
- The watcher never writes SQLite (ADR 0003). The api copies done jobs into the row on read.
