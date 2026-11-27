---
name: 2026-11-25-business-logic-waves-1-2
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-25-business-logic-review-plan.md (Waves 1 and 2)
domain: backend, shared, toolbox, web, seeds
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
Waves 1 and 2 of the business logic review: dead code removed and copy-pasted infrastructure
merged into single sources. There is one deliberate contract change: `API_CONTRACT_REVISION` 7 to 8.

## Why
The owner asked to "review the entire business logic, and plan to enhance the process, and remove
the unnecessary items or features or data", then chose "Start Waves 1+2".

## Scope
- Wave 1, dead code:
  - The `ace` CLI layer in `packages/toolbox` (about 3,650 lines) and the root `ace` script.
  - 10 orphaned toolbox files with 2 tests: the voice providers, `media-provider`, `title-card`,
    `png-encoder`, `scene-timings` and `render-input-mapper`. Their last commits are `c52a849` and `bffdab4`.
  - `hasContentSignature` and its test.
  - The `GET /metrics/imports` read chain in core, api and shared.
  - The always-null `replaced` field on the recipe and catalog version status results.
  - The PUT status bodies, now narrowed to `deprecated`.
  - Two stale comments.
- Wave 2, duplication:
  - `KeyedMutex` / `SerialMutex` in `packages/core/src/runtime/keyed-mutex.ts` replace both lock
    files and the inline copies.
  - `cost-file-append.ts` is shared by the cost ledgers.
  - Upload limits live in `@studio/shared/catalog`, and the web reads them from there.
  - The `CatalogCategory` collision is resolved: the web's is now `CatalogSubtype`.
  - `REVIEWABLE_RUN_STATUSES` is one constant.
  - `RunArtifactSaver` backs promote-from-run and save-video.
- Contract: `packages/shared/src/api/common.ts` revision 8, and `platforms-api.test.ts` asserts 8.
- Seeds:
  - The 12 `fagmer-video-*` skills that run `ace` are removed from `seeds/skills/`,
    `catalog.seed.json` and the seeds README.
  - `fagmer-video-seo-package` is kept.
- Lockfile: `@ace/video` and `commander` are removed from the toolbox importer.

## Checklist
- [x] Waves 1 and 2 implemented by 3 scoped workers and integrated, with an inspected diff
- [x] Every remaining `@ace/toolbox/dist/*` import in the watcher resolves to a kept file
- [x] Contract revision bumped, with the reason recorded in its doc comment
- [x] Seed skills retired; the manifest lists only the kept skill
- [x] `pnpm install --lockfile-only`: 8 diff lines, only the two removed deps
- [ ] Final checks (typecheck, lint, tests): skipped by the owner, pending

## Not done
- The plist single source was left as two copies by owner decision.
- The `@studio/ui` unused exports and the `VoiceSampleAudio` rename are deferred, because another
  session owns those files.
- Renaming promote-from-run to "Save as version" is deferred, because it changes UI copy.
- Catalog assets already seeded from the 12 retired skills stay in the database. Deprecate them in
  the catalog if they bind to a recipe slot.

## Human decisions
- 2026-11-25 | Ricardo Fagmer | Start Waves 1+2 | approved
- 2026-11-25 | Ricardo Fagmer | Final checks: Skip for now | validation pending
- 2026-11-25 | Ricardo Fagmer | Plist: leave both copies | approved
- 2026-11-25 | Ricardo Fagmer | Seed skills and orphaned toolbox files: retire both | approved
- 2026-11-25 | Ricardo Fagmer | Bump API_CONTRACT_REVISION; refresh the pnpm lockfile | approved

## Validation
[validation] pending: the owner skipped the final checks. Nothing was compiled or tested.
