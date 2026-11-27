---
name: 2026-11-25-music-spend-kind
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-25-music-spend-kind-design.md
domain: backend
security_review: pending
risk: high
preview: declined
new_feature: true
release: false
---

## What
A music spend kind in the cost ledger, so ElevenLabs music generation in `auto` music mode is priced, recorded in the run's spend and shown on the cost screen.

## Why
`priceMusicGeneration()` always answered `unpriced` because the cost format, price table and `cost_entries` knew only `model`, `tts` and `render`; live generation stopped for a person (follow-up named in `.engineos/changes/2026-11-25-ai-music-choice.md`).

## Scope
- `packages/shared`: `UsageQuantity`, `CostSessionSchema`, `TotalsSchema.costByProvider.music`.
- `packages/core`: price table entry and version, pricing, ledger, mappers, `schema.prisma`, migration `20261125120000_music_cost_kind` (authored, not run).
- `apps/watcher`: `music-generation-cost.ts`, `music-generation.ts`, `music.executor.ts`, `engine/cost-totals.ts`.
- `apps/web`: `ReviewCostCard`, `review-labels.ts`, run messages in pt-BR, es and en.
- `docs/RUN-FORMAT.md`.

## Checklist
- [x] Provider facts rechecked against current ElevenLabs pages
- [x] Owner decisions on rate, limit behaviour and totals split
- [x] Spec written
- [x] Spec approved by the owner
- [x] T1 shared contract
- [x] T2 core and migration (authored)
- [x] T3 watcher
- [x] T4 web
- [x] T5 docs
- [ ] Final checkpoint (typecheck, lint, tests): owner answered "Skip for now" on 2026-11-25
- [ ] Security review and critic pass: owner answered "Decline security review" on 2026-11-25; evidence stays missing

## What was made
- Shared: `UsageQuantity` and `CostSessionSchema` gained the `music` kind (`provider: 'elevenlabs'`, `musicSeconds`); `TotalsSchema.costByProvider.music` (default 0) and `emptyTotals`.
- Core: price table `2026-11-25.1` with `musicPerSecond.elevenlabs` at USD 0.0025 per second (owner-approved USD 0.15 per minute); `priceUsage`, `CostLedgerService.priceUsd`, `usageOfCostSession`, `toCostEntryData` and `assetJobCostUsageOf` handle `music`; `schema.prisma` `CostEntry.musicSeconds`; migration `20261125120000_music_cost_kind` authored (table redefinition), not run.
- Watcher: `priceMusicGeneration(ledger, lengthMs)` prices through the ledger and records one `music` session after the track is written; `music.executor.ts` `estimate()` prices the video's target length; `costTotals` has the `music` family.
- Web: `ReviewCostCard` shows a music session as a row in seconds; label `music` in pt-BR, es and en.
- Docs: `docs/RUN-FORMAT.md` (`costByProvider.music`, `music` session).
- Existing assertion updated to the new totals shape: `apps/watcher/src/daemon/__tests__/end-to-end.eval.test.ts`. No test was written or run.

## Not done
- Nothing has been compiled, linted, tested or run: no typecheck, no `prisma generate`, no test, no live generation, no look at the cost card in the browser. Acceptance 1 to 7 are unproven.
- The migration was not run. Until it is, indexing a run that holds a music session into `cost_entries` is refused by the database (CHECK on `kind`, missing `music_seconds`); how the api reports that was read in code only, not exercised. Reads of `cost_entries` use explicit column lists, so they do not touch the new column. Month-to-date still counts the session from `cost.json`.
- No new tests for the music kind (held for the final gate).
- The Planner's price summary (`toPriceTableSummary`) does not list the music rate.
- Security review and critic pass: declined by the owner on 2026-11-25; no reviewer read this change. `security_review` stays `pending`.

## User checklist
- [x] Approve the spec
- [ ] Run or approve the final checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`) before relying on this change
- [ ] Decide on the security review before any PR (the PR gate holds while `security_review: pending`)
- [ ] Confirm and run migration `20261125120000_music_cost_kind` (back up `db/studio.sqlite` first)
- [ ] Confirm the ElevenLabs plan allows music generation through the API

## Verification
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-25 | Ricardo Fagmer | high-risk | approved | Rate "USD 0.15/min (Recommended)"; limit reached "Warn and generate"; totals split "New `music` line (Recommended)"
- 2026-11-25 | Ricardo Fagmer | high-risk | approved | Spec "Approve (Recommended)"; preview "No preview, build (Recommended)"
- 2026-11-25 | Ricardo Fagmer | high-risk | refused | Final checks "Skip for now"; security review "Decline security review"

## Changes registered
`git status --short` over this task's paths (2026-11-25; several files also carry earlier uncommitted work from other changes; `apps/watcher/src/stages/music/` is untracked from the parent change):

```
 M apps/watcher/src/daemon/__tests__/end-to-end.eval.test.ts
 M apps/watcher/src/engine/cost-totals.ts
 M apps/watcher/src/stages/executors/music.executor.ts
 M apps/web/src/features/review/components/ReviewCostCard.tsx
 M apps/web/src/features/review/review-labels.ts
 M apps/web/src/messages/runs/en.ts
 M apps/web/src/messages/runs/es.ts
 M apps/web/src/messages/runs/pt-BR.ts
 M docs/RUN-FORMAT.md
 M packages/core/prisma/schema.prisma
 M packages/core/src/costs/asset-job-cost.mapper.ts
 M packages/core/src/costs/cost-ledger.service.ts
 M packages/core/src/costs/cost-session.mapper.ts
 M packages/core/src/costs/price-table.ts
 M packages/core/src/costs/pricing.ts
 M packages/shared/src/ports/cost-ledger.ts
 M packages/shared/src/run-format/cost.ts
 M packages/shared/src/run-format/run-file.ts
?? .engineos/changes/2026-11-25-music-spend-kind.md
?? apps/watcher/src/stages/music/music-generation-cost.ts
?? apps/watcher/src/stages/music/music-generation.ts
?? docs/specs/2026-11-25-music-spend-kind-design.md
?? packages/core/prisma/migrations/20261125120000_music_cost_kind/
```

## Notes
- Provider pages read 2026-11-25: https://elevenlabs.io/pricing/api (USD 0.15 per minute, 5 minute limit), https://elevenlabs.io/docs/api-reference/music/compose (`music_v2_5` valid, `music_length_ms` 3000 to 600000). Paid-plan requirement for the API is not stated.
- 2026-11-25 owner answers: spec "Approve (Recommended)"; preview "No preview, build (Recommended)".
- "Warn and generate" replaces "spend limit reached: the stage stops for a person" from the parent spec and from the brief that started this work.
- The parent change is uncommitted in the same working tree and unvalidated.
