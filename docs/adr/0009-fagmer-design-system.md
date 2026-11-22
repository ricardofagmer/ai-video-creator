# 0009. Use the Fagmer design system through CSS-variable tokens with `light-dark()`, keeping the existing token names

Date: 2026-11-22
Status: accepted (owner, 2026-11-22). The owner asked for the Video Studio UI to follow the
fagmertech design system in light and dark mode. On 2026-11-22 the owner chose to close the
remaining gaps on top of commit `4ab39ad`, to edit the main checkout, and to write this ADR and
`docs/design-system.md` in English.

Decider: Ricardo Fagmer. Sources: the fagmertech site tokens (`--ft-*` in
`/Users/ricardofagmer/projects/fagmertech/site/`); the design spec
`docs/specs/2026-11-22-fagmer-design-system-design.md`; the archived change record
`.engineos/archived/2026/11/frontend/2026-11-22-fagmer-design-system.md`; the code read on
2026-11-22, cited as `path:line`.

## Context

The owner's other products (the fagmertech site and apps) share one look: a navy void
background, electric blue to cyan accents, Space Grotesk for display, Inter for body and
JetBrains Mono for code. Video Studio had its own neutral token set, so it looked like a
different product.

The fagmertech site defines its tokens as `--ft-*` custom properties and ships a dark theme only.
Video Studio needs both themes: the owner works in daylight as well as at night, and the studio
already promised to follow the operating system.

Video Studio already had one token file, `packages/ui/src/styles/tokens.css`, read by every
component in `@studio/ui` and by every screen in `apps/web`. Neither project uses Tailwind. The
web app sends a nonce-based Content Security Policy, so an inline script is not free.

Forces:

- One source of truth for every colour, type, spacing, radius, shadow and motion value.
- Light and dark values next to each other, so a new token cannot ship with one theme missing.
- The theme follows the OS by default and can be forced, with no flash on first paint.
- Component code should not change when a value changes.
- Text must keep WCAG AA contrast in both themes.

## Decision

1. **Tokens stay CSS custom properties in `packages/ui/src/styles/tokens.css`**, the only
   stylesheet allowed to hold a colour literal. The existing Video Studio token names
   (`--color-primary`, `--color-surface`, `--space-4`, `--radius-md`, and so on) are kept; only
   their values change to the Fagmer palette.
2. **Each semantic colour token is declared once with `light-dark()`**, with
   `color-scheme: light dark` on `:root`. The dark values come straight from `--ft-*`; the light
   values are derived from the same hues (ink text `#0A1430` on near-white blue-tinted greys).
3. **The theme is forced with `data-theme` on `<html>`.** `:root[data-theme="light"]` and
   `:root[data-theme="dark"]` set `color-scheme` to one value, which makes every `light-dark()`
   resolve to that side.
4. **The owner's choice lives in the `vs-theme` cookie** (`packages/ui/src/components/theme/theme.ts:5`).
   The root layout reads it on the server and renders `data-theme`
   (`apps/web/src/app/layout.tsx:14`), so there is no inline script and no flash.
5. **A three-way `ThemeToggle` (system, light, dark)** sits in the studio top bar. It updates
   `data-theme` at once and rewrites the cookie for one year.
6. **Fonts are self-hosted woff2 files** (Space Grotesk, Inter, JetBrains Mono) declared in
   `fonts.css`, so no request leaves the machine.
7. **Literal policy:** outside `tokens.css`, stylesheets use tokens only. Two exceptions stay
   literal because a token would add no meaning: `1px` hairline borders and the pixel values in
   `@media` queries (custom properties do not work in media queries).

## Alternatives considered

- **Rename the tokens to `--ft-*`.** This would match the source exactly but touch every
  stylesheet for no visual gain, and the fagmertech names describe a dark-only palette
  (`--ft-void`, `--ft-panel`) that does not fit a light theme. Rejected.
- **Adopt Tailwind.** Neither project uses it. It would add a build dependency and a second
  styling system next to the CSS modules. Rejected.
- **Keep the choice in `localStorage` and apply it with an inline script in `<head>`.** This is
  the common pattern, but the inline script needs a CSP nonce or hash, and the server would still
  render the wrong theme first. The cookie lets the server render the right theme. Rejected.
- **Copy the fagmertech stylesheet verbatim.** The site is dark only and its selectors target its
  own markup. Rejected.
- **Use the bright brand gradient behind text** (for example the primary button). White text on
  the cyan end of the gradient falls below 4.5:1. The bright gradient stays decorative (logo,
  active-tab beam), and controls use the darker electric blue gradient. Rejected for text.

## Consequences

- A value change, such as a new primary blue, is one edit in `tokens.css`.
- `light-dark()` needs a current browser (Chrome 123, Safari 17.5, Firefox 120). The studio is a
  local tool the owner opens in a current browser, so this is accepted.
- A screen that needs a new colour, size or shadow adds a token first and documents it in
  `design/tokens.md`. Reviews reject a raw literal.
- The rule is checkable with grep; the commands are in `docs/design-system.md`. Two kinds of hit
  are expected and allowed: data values that are not styling (default brand-kit colours in
  `apps/web/src/features/catalog/asset-form/kind-details-model.ts`), and the hairline and
  media-query exceptions above.
- `apps/shell` is an Electron menu-bar app with no window or HTML, so it has nothing to theme.
- No visual regression test exists yet; the web app has no test runner. Light and dark screens
  are checked by eye until one is added.

## Reversal

Revert the token values in `tokens.css`, `fonts.css` and the font files, and remove the
`ThemeToggle` from the studio layout. Component code does not need to change, because it reads
token names only.
