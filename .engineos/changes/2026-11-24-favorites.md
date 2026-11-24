---
name: 2026-11-24-favorites
status: active
owner: Claude (supervisor) for the owner
spec: n/a — fast change chosen by the owner; web-only, low risk, decisions recorded under Human decisions
domain: frontend
security_review: not-required
risk: low
new_feature: true
release: false
---

## What
Favorites on the Catálogo page and on the Receitas page: a star on every item, and a "Só favoritos"
button on each page that filters the list to that page's own favorites.

## Why
The owner asked (2026-11-24): "I want to add a favorites feature to the catalog page and the
receitas (recipes) page. On each item I can mark it as a favorite, which builds my own favorite
set. On each page I can then filter the list to show only my favorites." Reason given: "Find my
usual items fast".

## Scope
`apps/web/src/features/favorites` (new), the catalog card and grid, the catalogo and receitas pages,
a new receitas table component, web texts in pt-BR, en and es, and a star icon in
`packages/ui/src/components/icon/Icon.tsx`. No api, no database, no cookie.

## Checklist
- [x] Owner answered the open questions through clickable options (see Human decisions)
- [x] Routed: `intent=frontend risk=low autonomy=A2 dispatch=parallel-independent`, one
      `frontend-coordinator` worker, supervisor integrates
- [x] Worker returned (DEGRADED: nothing run) and all its files read by the supervisor
- [x] Star, "Só favoritos (N)" button, filter, counts and empty state seen working with stand-in items
      (see Verification)
- [x] Favoriting on one page does not change the other (stand-in check: two separate storage keys)
- [x] Favorites and the filter choice survive a reload (stand-in check); a browser restart was not tried
- [x] Texts in pt-BR, en and es (stand-in check)
- [x] Catálogo page itself: star on every real card, filter, count (seen, see Verification)
- [x] Receitas page itself: star on every real row, filter, count (seen, see Verification)

## Corrections asked by the owner (2026-11-24)
"favorites should be yellow when saved, also the quantity must be by category (tab)", with a
screenshot of the "Modelos de vídeo" tab reading "Só favoritos (3)".
- [x] A saved favorite's star is yellow (`.marked` in `favorites.module.css`: `#e0a100` on the light
      theme, `#fbbf24` on the dark one), on `FavoriteToggleButton`.
- [x] The number on "Só favoritos (N)" counts the favorites among the items of the open list (the
      open tab and sub-tab in Catálogo, the listed recipes in Receitas): `OnlyFavoritesButton` takes
      the list's ids. Versions of one asset count once.
- [ ] Seen on the real pages (blocked: the owner's session at 4320 expired during the check)

## What was made
Written by the `frontend-coordinator` worker (4m21s), read file by file by the supervisor. The dev
server compiled both pages; no typecheck, lint or test was run.
- `features/favorites/favorites-store.ts`: two sets in localStorage (`studio.favorites.catalog.v1`,
  `studio.favorites.recipes.v1`) and the remembered filter (`studio.favorites.only.<page>.v1`);
  stored text is treated as untrusted (strings of 1 to 200 characters, de-duplicated, at most 500).
- `FavoriteToggleButton` (icon-only star, `aria-pressed`, named for screen readers) and
  `OnlyFavoritesButton` ("Só favoritos (N)", primary when on), both the app's own `Button`.
- Catalog: star beside the cart button on every card; cards, group sections and counts follow the
  filter; an empty state with "Mostrar tudo" when no card of the list is a favorite.
- Receitas: new client `RecipesTable` with a "Favorita" star column first, the filter button above
  the table and the same empty state.
- Texts in pt-BR, en and es (`messages/favorites`), and `star` / `star-filled` icons in `@studio/ui`.

## Not done
- Not seen: the two real pages on a narrow (phone-width) screen, in the light/dark theme other than
  the one the owner's browser had, and in en or es (those three were seen on the stand-in page only).
- The catalog's tab and sub-tab number chips ("Referências 2", "Todos 2") keep the full totals while
  the filter is on; only the captions and the cards follow the filter.
- No typecheck, lint or test was run (owner: "Skip for now"); no test was written. The web and ui
  packages have no test script.
- Cards are rendered on the server and hidden after the page loads, so with the filter on the full
  list can show for an instant before it narrows.
- Known limits: favorites are per browser; the catalog filter covers the cards loaded on the open
  tab (up to 100), not later pages; the search-by-meaning mode shows the star but has no filter
  button. (Superseded on 2026-11-24: the count on the button was the size of the whole set; it now
  counts the open list only.)

## User checklist
- [x] Api running again so the pages have data (owner, 2026-11-24: "Yes, check now")
- [ ] Approve typecheck and lint for `@studio/web` and `@studio/ui` (4 commands, listed under
      Verification)
- [ ] Favorite something, quit and reopen the browser, and confirm it is still marked
- [ ] Look at the yellow star and the per-tab number on the real pages the next time the dev api runs,
      or after the desktop app is repackaged with this change

## Human decisions
| Date | Who | Reason ids | Decision | Note |
|---|---|---|---|---|
| 2026-11-24 | Ricardo Fagmer | none | approved | Why: "Find my usual items fast". The list order does not change. |
| 2026-11-24 | Ricardo Fagmer | none | approved | Storage: "In this browser (Recommended)". Each browser keeps its own set; clearing browser data removes it. |
| 2026-11-24 | Ricardo Fagmer | none | approved | Display: "Star + 'Só favoritos' button (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Extra done checks: "Survive reload and restart", "Filter stays on when I return", "Show how many favorites", "Texts in pt-BR, en and es". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Planning: "Fast change (supervisor) (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | refused | Final checks (typecheck and lint, web and ui): "Skip for now". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Artifact: "Proceed without artifact (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Corrections: yellow star when saved; quantity per category (tab). |
| 2026-11-24 | Ricardo Fagmer | none | refused | Final checks after the corrections (same 4 commands): "Skip for now". |

No HITL reason fired: risk low, no external effect.

## Verification
[validation] pending — final-stage user approval required

- Checkpoint: `kernel checkpoint --files <24 files> --risk low --new-feature true` answered
  `checks: ask`, `security: skip`, `offers: ask`. Proposed and not run: `corepack pnpm --filter
  @studio/web run typecheck`, `... run lint`, `corepack pnpm --filter @studio/ui run typecheck`,
  `... run lint`.
- Tests and the browser pass by `qa-tester`: not offered. No test script exists in the web or ui
  package, and a browser pass needs the api, which is down. Unavailable evidence, not a pass.
- Dev server (127.0.0.1:4320, 2026-11-24): `/receitas` and `/catalogo` compiled with the new files
  ("Compiled /catalogo ... 2294 modules"), then failed on `ApiUnreachableError` and redirected to
  `/login`. So the files compile in dev; the pages were not seen.
- Stand-in check, looked at, not a check run (built-in browser, 2026-11-24): a temporary page
  `app/zz-favorites-check/page.tsx` rendered the real favorites components, `AssetCard`,
  `CartToggleButton` and `RecipesTable` with five stand-in cards in two groups and three stand-in
  recipes. Seen: the outline star beside the cart button and in the first table column; a click
  fills it and the button reads "Favorites only (2)"; the filter left 2 of 5 cards, hid the group
  with no favorite and both captions read "2 assets"; after a reload the marks and the filter were
  still on; receitas kept its own set (storage held `["check-a1","check-a3"]` and `["check-r2"]`
  under separate keys); removing the only favorite recipe with the filter on showed "No favorites
  in this list" with "Show all", which turned the filter off; the texts read "Só favoritos (2)" and
  "Favorita" in pt-BR and "Solo favoritos (2)" and "Favorita" in es; the light theme showed the
  filled star. No console error. The temporary page was deleted and its storage keys and language
  cookie removed afterwards.
- Real pages, looked at, not a check run (owner's Chrome, http://127.0.0.1:4320, pt-BR, 2026-11-24,
  after the owner said the api was back):
  - `/receitas`: 3 rows, a star in the first column of each, "Só favoritos (0)". Starring "Tool Demo
    9:16" and turning the filter on left that one row and the button read "Só favoritos (1)"; after
    a reload the row, the filled star and the filter were still there.
  - `/catalogo` (Referências): a star beside the cart button on both cards, the button under the
    filter bar reading "Só favoritos (0)" although receitas had one favorite. Starring one card and
    turning the filter on left 1 visible card and 1 hidden; the top caption and the "Vídeos" group
    caption both read "1 ativo"; the same after a reload.
  - `/catalogo?secao=ia-e-escrita` with the filter still on: 17 cards hidden, both groups hidden,
    "Nenhum favorito nesta lista" with "Mostrar tudo"; the click brought back 17 cards with 17
    stars (42x32 px each), the star sitting between the cart button and "Ouvir" on the voice cards;
    no horizontal page scroll.
  - Storage held `studio.favorites.catalog.v1` = `["ig-dfdrn7xgi3g"]` and
    `studio.favorites.recipes.v1` = `["tool-demo-9x16"]` as separate keys. The owner's browser had
    no favorites key before the check; all four test keys were removed afterwards and `/receitas`
    read "Só favoritos (0)" with 3 rows again.

- Corrections, stand-in check, looked at, not a check run (built-in browser, 2026-11-24): on a
  temporary page with two lists sharing one favorite set (3 marks: 2 in the first list, 1 in the
  second) the buttons read "Favorites only (2)" and "Favorites only (1)"; the marked stars' computed
  colour was `rgb(251, 191, 36)` on the dark theme and `rgb(224, 161, 0)` on the light one. The
  temporary page and its storage keys were removed. The owner's own three catalog favorites were
  not touched.

- Real-page check, not possible (2026-11-24): after the installed app restarted its api, the dev
  server logged `POST /api/studio/auth/login 403`. The api allows writes only from its configured
  web origin (`apps/api/src/platform/api-config.ts`: default `http://127.0.0.1:4310`), so a sign-in
  from `127.0.0.1:4320` is refused, and the page at 4310 is the packaged build without this change.
  Owner: "Leave it for now (Recommended)". Unavailable evidence, not a pass.

## Changes registered
Not a git repository; files listed by hand.

New (under `apps/web/src`):
- features/favorites/favorites-store.ts
- features/favorites/use-favorite-filter.ts
- features/favorites/favorites.module.css
- features/favorites/components/FavoriteToggleButton.tsx
- features/favorites/components/OnlyFavoritesButton.tsx
- features/favorites/components/FavoriteFilterItem.tsx
- features/favorites/components/FavoriteFilterSection.tsx
- features/favorites/components/CatalogFavoriteCount.tsx
- features/favorites/components/FavoritesEmptyState.tsx
- features/recipes/components/RecipesTable.tsx
- messages/favorites/pt-BR.ts, en.ts, es.ts

Changed:
- apps/web/src/features/catalog/components/CatalogAssetItem.tsx
- apps/web/src/features/catalog/components/CatalogGroupedGrid.tsx
- apps/web/src/app/(studio)/catalogo/page.tsx
- apps/web/src/app/(studio)/receitas/page.tsx
- apps/web/src/messages/pt-BR.ts, en.ts, es.ts
- apps/web/src/messages/recipes/pt-BR.ts, en.ts, es.ts (column header)
- packages/ui/src/components/icon/Icon.tsx
