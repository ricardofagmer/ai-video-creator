---
name: 2026-11-22-fagmer-design-system-gaps
status: done
completed: 2026-11-22
owner: Ricardo Fagmer
spec: docs/specs/2026-11-22-fagmer-design-system-design.md
adr: docs/adr/0009-fagmer-design-system.md
follows: .engineos/archived/2026/11/frontend/2026-11-22-fagmer-design-system.md
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
Closes the gaps left after commit `4ab39ad` (Fagmer design system): every remaining raw design
value in `packages/ui` and `apps/web` stylesheets now reads a token, `design/tokens.md` matches
`tokens.css`, and the choice is recorded in ADR 0009 with a short `docs/design-system.md`.

## Why
The owner asked for tokens defined once, components and screens using only tokens, a grep that
shows it, a design-system doc and an ADR. Commit `4ab39ad` did most of it; raw lengths, shadows,
blurs and a mask colour were still inline, and the token doc had drifted.

## Scope
In: `packages/ui/src/styles/{tokens,base,utilities}.css`, component CSS modules in
`packages/ui/src/components/`, `apps/web/src/features/{curations,publishing,schedules}/*.module.css`,
`design/tokens.md`, `docs/adr/0009-fagmer-design-system.md`, `docs/design-system.md`.
Out: `apps/shell` (Electron menu-bar app with no window), test folders and the super-dev run of
another session, `.engineos/memory/*`, `apps/web/next-env.d.ts`, `packages/toolbox/package.json`
(changed by other sessions).

## Checklist
- [x] Add tokens for strokes, glass and overlay blur, grid cell, mask, focus halos, glow shadows,
      letter spacing, mono size, snug line height, `--space-0-5`, `--radius-xs`,
      `--control-height-xs`, beam offset, diff height, hover lift
- [x] Replace raw values in 18 `packages/ui` files and 3 `apps/web` files
- [x] Sync `design/tokens.md` with `tokens.css` (no undocumented token)
- [x] ADR 0009 and `docs/design-system.md` in English
- [x] Grep report: no colour literal outside `tokens.css` except brand-kit default data; no raw
      length except `1px` hairlines and `@media`; every `var()` defined
- [x] `pnpm --filter @studio/web build` (owner chose "Build + browser check", 2026-11-22)
- [x] Browser check of `/login` in light and dark, forced theme over the OS, reload keeps it
- ~~Typecheck and lint~~ not chosen by the owner; this pass changed no TypeScript

## What was made
- `tokens.css` gained 26 lines of tokens (see Checklist), each with light and dark behaviour
  through existing semantic colours.
- Stylesheets read those tokens instead of `2px`, `4px`, `13px`, `blur(...)`, inline shadows,
  `#000` and numeric line heights and weights.
- `design/tokens.md` section 1.4 rewritten to the real values (it listed old primary shades,
  greys and overlay colours), plus rows for the glow, grid, glass and accent tokens, letter
  spacing, strokes, glass and grid sections.

## Human decisions
- 2026-11-22, Ricardo Fagmer: "Close the gaps (Recommended)"; "Edit main checkout";
  "English (Recommended)" for the ADR and doc.

## Evidence
- Colour grep: only `apps/web/src/features/catalog/asset-form/kind-details-model.ts:45,48`
  (default brand-kit data).
- Raw-length grep (excluding `1px`, `@media`, `tokens.css`): no output.
- Undefined-variable check: no output.
- `next build`: exit 0, 23 routes compiled, every CSS module included.
- Browser (`next start` on 4310, API not running): `/login` renders in both OS themes; after
  choosing "Tema claro" under a dark OS, `data-theme="light"`, cookie `vs-theme=light`, body
  background `rgb(245, 248, 255)`, text `rgb(10, 20, 48)`; reload keeps it; `--stroke-thin`,
  `--backdrop-glass` and `--shadow-focus-halo-control` resolve; no console errors. Studio screens
  behind login were not opened (no API and no login in this check).
