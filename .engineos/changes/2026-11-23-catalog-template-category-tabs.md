---
id: 2026-11-23-catalog-template-category-tabs
status: open
risk: low
autonomy: A2
security_review: not-required
spec: none (Fast change)
---

# Catalog: template category tabs

## Request
"group the templates by category in tabs" on `/catalogo`.

## Human decisions
- 2026-11-23, developer: category = content type from tags (Content type), not aspect ratio.
- 2026-11-23, developer: Fast change (supervisor), no spec.
- 2026-11-23, developer: final checks (typecheck, lint) skipped for now.

## What was made
- `apps/web/src/features/catalog/template-categories.ts` (new): closed category list
  (hook, title, tool-demo, ai-battle, automation, product-tour, other), derived from the
  first matching tag; counts and tab ids.
- `catalog-query.ts`: `?categoria=` filter, kept only on `?tipo=template`; kind tabs reset it;
  `templateCategoryTabHref`.
- `CatalogKindTabs.tsx`: optional `panelId` so the category tabs nest their own tab panel.
- `catalogo/page.tsx`: Templates tab shows "All" plus each category present, with counts;
  the selected category filters the cards, aspect sections stay inside.
- Messages pt-BR/en/es: `tabs.templateCategoriesLabel`, `categories.templateTypes`.
- Follow-up (developer: "i said to use TABS", chose "Tabs on default page"): the category tabs also
  show in the Templates section of the default "All" view. `?categoria=` now lives on "All" too and
  filters only templates; `CatalogGroupedGrid` takes optional per-section `tabs`.

## Checklist
- [x] Tabs render with counts on `/catalogo?tipo=template` (browser)
- [x] Clicking a tab filters cards and keeps `?categoria=` in the URL; focus moves to the tab
- [x] Unknown `?categoria=` falls back to "All"; other kinds ignore it
- [ ] `[validation] pending — final-stage user approval required` (typecheck, lint skipped)
- [ ] No unit tests for `template-categories.ts` yet

## Not done
- Typecheck and lint: skipped by the developer at the final checkpoint.
- Unit tests for `template-categories.ts`.

## User checklist
- [ ] Run `pnpm --filter web typecheck` and `pnpm --filter web lint` (deferred final-gate checks)
- [ ] Decide whether to add unit tests for `template-categories.ts`
- [ ] Commit the change (no git write made)

## Human decisions
No HITL reason fired (risk low, A2). Developer choices are listed above under Human decisions.

## Changes registered
The working tree holds other uncommitted work (untracked `CatalogKindTabs.tsx` and catalog
messages predate this change; the `page.tsx` diff also includes earlier uncommitted edits).
Scoped to this change's files:

```
 M apps/web/src/app/(studio)/catalogo/page.tsx
 M apps/web/src/features/catalog/catalog-query.ts
?? .engineos/changes/2026-11-23-catalog-template-category-tabs.md
?? apps/web/src/features/catalog/components/CatalogKindTabs.tsx
?? apps/web/src/features/catalog/template-categories.ts
?? apps/web/src/messages/catalog/en.ts
?? apps/web/src/messages/catalog/es.ts
?? apps/web/src/messages/catalog/pt-BR.ts
---
 apps/web/src/app/(studio)/catalogo/page.tsx    | 243 ++++++++++++++++++++-----
 apps/web/src/features/catalog/catalog-query.ts |  26 ++-
 2 files changed, 217 insertions(+), 52 deletions(-)
```
No moves or renames.

## Verification
- Browser check on `/catalogo?tipo=template` (tabs, filtering, URL, focus, fallback): passed, 2026-11-23.
- Browser check on `/catalogo` (category tabs in Templates section; Hooks shows 2, other kinds intact,
  focus kept, `?categoria=hook`): passed, 2026-11-23.
- `[validation] pending — final-stage user approval required` (typecheck, lint not run).

## Known limits
- Filtering happens on the fetched page (limit 100); counts hide when there is a next page.
