---
name: 2026-11-24-studio-video-maker-redesign
status: in-progress
owner: Ricardo Fagmer
domain: frontend
risk: low
spec: none (owner chose "Go straight to code")
security_review: not-required
new_feature: false
release: false
---

# Studio pages in the Skills/cart video-maker style

## What
Owner request: "only skills page and cart have great design, all the other features are very poor,
so improve as those ones to get a video maker style system". Owner answers: all pages at once;
cinema hero banner + poster cards + segmented tabs; shared primitives in `apps/web/src/features/common`;
no spec. Visual restyle only: data, routes, actions, i18n and accessibility stay the same.

## Shared primitives (supervisor)
- `features/common/studio-artwork.ts`: glyph names, tones, `studioArtworkOf`, `studioToneOf`.
- `features/common/components/StudioGlyph.tsx` (moved from `skills/components/SkillGlyph.tsx`, 5 new glyphs).
- `features/common/components/StudioHero.tsx` + `studio-hero.module.css` (moved from SkillsHero; `banner` and `compact` variants, `back` and `meta` slots).
- `features/common/components/PosterCard.tsx` + `poster-card.module.css` (split out of `skills.module.css`; `excerpt`, `coverBadge`).
- `messages/common/*`: `heroEyebrows` per section, three locales.
- Skills page, SkillList and cart tiles switched to the shared primitives; `SkillsHero.tsx` removed.

## Ticket ledger
| Unit | Owner | Scope | State |
|---|---|---|---|
| Shared primitives | supervisor | features/common, skills, cart imports | integrated |
| A | frontend-coordinator | execucoes, criar; runs, review, wizard, publishing, learnings | integrated (RunList posters, heroes) |
| B | frontend-coordinator | receitas, agendamentos, comparacoes; recipes, schedules, comparisons, promotion | integrated (RecipeList replaces RecipesTable, ComparisonList, ScheduleSummaryCard poster) |
| C | frontend-coordinator | metricas, indicadores, curadorias, contas, skills forms; metrics, insights, curations, platforms | integrated (PlatformCard poster, KPI tone strips, segmented skill-mode tabs) |
| Catalog | supervisor | catalogo, features/catalog views | integrated after the image-categories session finished (CatalogAssetItem poster with media cover, StudioHero on list, new, detail) |

Supervisor cleanup after returns: dead `.modes` removed from `skills.module.css`; unused
`comparisons.list.columns.title/status` removed from `messages/curations/*`.

## Checklist
- [x] Shared primitives written; web typecheck clean outside the catalog files another session is editing
- [x] Worker returns inspected and integrated
- [x] Catalog pages restyled: `PosterCard` gained a `media` cover (real thumbnail, perforations on top); `CatalogAssetItem` is a poster with the kind's artwork from `cartKindArtwork`; `StudioHero` replaces `PageHeader` on `/catalogo`, `NewAssetView`, `AssetDetailView` (h1 kept for `FocusHeadingOnVersionChange`). Seen on 4320 dark, light, 375px: references (video thumbnails), AI & writing (17 posters), images (library tiles from the categories session, unchanged), detail, novo. Web typecheck clean.
- [x] Visible check in the app (dev 4320), dark and light, plus 375px width: skills, execucoes, run detail, revisao, criar, receitas, receitas/nova, agendamentos, comparacoes, metricas/importar, indicadores, contas, skills/novo. `/metricas` and `/curadorias` have no index page (404 before this change too). Curation and schedule detail not seen: no data.
- [ ] Final checks: owner answered "Skip for now" at the final gate. `[validation] pending — final-stage user approval required`

## Human decisions
| When | Who | Decision |
|---|---|---|
| 2026-11-24 | Ricardo Fagmer | All pages at once; Hero + cards + tabs; apps/web common; go straight to code |
| 2026-11-24 | Ricardo Fagmer | Final checks: Skip for now (lint, tests, build pending) |
