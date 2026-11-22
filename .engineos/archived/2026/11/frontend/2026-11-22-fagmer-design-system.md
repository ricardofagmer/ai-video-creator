---
name: 2026-11-22-fagmer-design-system
status: done
completed: 2026-11-22
owner: Ricardo Fagmer
spec: docs/specs/2026-11-22-fagmer-design-system-design.md
domain: frontend
security_review: not-required
risk: low
new_feature: true
release: false
---

## What
The Video Studio web UI now follows the Fagmer design system of the fagmertech site, in light and
dark mode, with a theme switch.

## Why
The owner asked that Video Studio match the design system of their other apps.

## Scope
`packages/ui` tokens, fonts, base and utility styles, component CSS modules, a new theme
component; `apps/web` root and studio layouts and the login page; `design/tokens.md`.

## Checklist
- [x] Map the site's palette and fonts onto the existing token names
- [x] Derive light mode values
- [x] Restyle shell, logo, button, card, dialog, table, inputs and rating input
- [x] Add ThemeToggle with cookie persistence and server-rendered `data-theme`
- [x] Update `design/tokens.md`
- [x] Typecheck `@studio/ui` and `@studio/web`
- ~~Production build and browser check in both themes~~ — skipped by the owner on 2026-11-22

## What was made
- Rewrote `tokens.css`: ink scale from the site's navy neutrals, electric blue primary, cyan
  accent, brand/rail/control/page gradients, glass surface, glow border and shadows,
  `--color-on-brand`, `--font-display`, Inter / Space Grotesk / JetBrains Mono, larger radii,
  the site's easing curve.
- Added `fonts.css` and copied the three woff2 files into `packages/ui/src/styles/fonts/`.
- `base.css`: page halos and blueprint grid, display font on h1-h3, branded selection and focus
  glow. `utilities.css`: display font on headings and metric, new `.eyebrow` and `.text-gradient`.
- Floating glass top bar with gradient rail and mono navigation with beam underline (AppShell);
  gradient monogram logo; gradient primary button with glow; card inner glow; dialog glow and
  blurred backdrop; mono table headers; input focus glow; gradient selected rating pill.
- New `ThemeToggle` (system, light, dark) and `theme.ts` helpers, exported from `@studio/ui`,
  placed in the top bar and on the login page; the root layout reads the `vs-theme` cookie and
  renders `data-theme`.
- Removed the login page's own background so the page halos show.
- Documented the new palette, gradients and font families in `design/tokens.md`.

## Not done
Production build and visual browser check in light and dark: the owner chose to skip them.

## User checklist
- [ ] Run `pnpm --filter @studio/web build`, start studio-api and studio-web, and check both themes in the browser

## Verification
- ran: `packages/ui: tsc --noEmit` exit 0 (2026-11-22)
- ran: `apps/web: tsc --noEmit` exit 0 (2026-11-22)

## Human decisions
2026-11-22 | Ricardo Fagmer | none (no hitl reason fired) | chose fagmertech site as reference and video-studio web as target | —
2026-11-22 | Ricardo Fagmer | none | refused the build + browser final check ("Skip for now") | left as a user checklist item

## Changes registered
Files of this change only (the working tree also holds unrelated earlier changes:
`.engineos/memory/*`, `apps/web/next-env.d.ts`, `packages/toolbox/package.json`, `__tests__/` folders).

```
git status --short (this change)
 M apps/web/src/app/(studio)/layout.tsx
 M apps/web/src/app/layout.tsx
 M apps/web/src/app/login/page.tsx
 M apps/web/src/features/common/layout.module.css
 M design/tokens.md
 M packages/ui/src/components/button/Button.module.css
 M packages/ui/src/components/card/Card.module.css
 M packages/ui/src/components/dialog/Dialog.module.css
 M packages/ui/src/components/form/Control.module.css
 M packages/ui/src/components/layout/AppShell.module.css
 M packages/ui/src/components/layout/Logo.module.css
 M packages/ui/src/components/review/RatingInput.module.css
 M packages/ui/src/components/table/Table.module.css
 M packages/ui/src/index.ts
 M packages/ui/src/styles/base.css
 M packages/ui/src/styles/globals.css
 M packages/ui/src/styles/tokens.css
 M packages/ui/src/styles/utilities.css
?? docs/specs/2026-11-22-fagmer-design-system-design.md
?? packages/ui/src/components/theme/theme.ts
?? packages/ui/src/components/theme/ThemeToggle.tsx
?? packages/ui/src/components/theme/ThemeToggle.module.css
?? packages/ui/src/styles/fonts.css
?? packages/ui/src/styles/fonts/inter-latin.woff2
?? packages/ui/src/styles/fonts/jetbrains-mono-latin.woff2
?? packages/ui/src/styles/fonts/space-grotesk-latin.woff2

git diff --stat HEAD (this change)
 apps/web/src/app/(studio)/layout.tsx               |  11 +-
 apps/web/src/app/layout.tsx                        |   8 +-
 apps/web/src/app/login/page.tsx                    |   5 +-
 apps/web/src/features/common/layout.module.css     |   1 -
 design/tokens.md                                   |  94 +++--
 .../ui/src/components/button/Button.module.css     |  18 +-
 packages/ui/src/components/card/Card.module.css    |   2 +-
 .../ui/src/components/dialog/Dialog.module.css     |   8 +-
 packages/ui/src/components/form/Control.module.css |   5 +-
 .../ui/src/components/layout/AppShell.module.css   |  59 ++-
 packages/ui/src/components/layout/Logo.module.css  |  13 +-
 .../src/components/review/RatingInput.module.css   |   8 +-
 packages/ui/src/components/table/Table.module.css  |   8 +-
 packages/ui/src/index.ts                           |   4 +
 packages/ui/src/styles/base.css                    |  30 ++
 packages/ui/src/styles/globals.css                 |   1 +
 packages/ui/src/styles/tokens.css                  | 133 ++++---
 packages/ui/src/styles/utilities.css               |  34 ++
```

- No renames or moves; 18 files modified, 8 files added; nothing committed.

## Notes
Token names were kept on purpose so no component needed a colour edit; see the spec's rejected
alternatives.
