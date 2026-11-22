# Video Studio design system

Video Studio uses the Fagmer design system, the same look as the fagmertech site: a navy void
background, electric blue to cyan accents, Space Grotesk for display, Inter for body and
JetBrains Mono for code. It works in light and dark mode. Why it is built this way is recorded in
[ADR 0009](adr/0009-fagmer-design-system.md); the design notes are in
[the spec](specs/2026-11-22-fagmer-design-system-design.md). The full token reference (in pt-BR)
is [design/tokens.md](../design/tokens.md).

## Where things live

| File | Holds |
|---|---|
| `packages/ui/src/styles/tokens.css` | Every token. The only stylesheet allowed to hold a colour literal. |
| `packages/ui/src/styles/fonts.css` | `@font-face` rules for the three self-hosted woff2 files in `styles/fonts/`. |
| `packages/ui/src/styles/base.css` | Element defaults: page background, grid, focus halo, body type. |
| `packages/ui/src/styles/utilities.css` | Type classes: `.heading-1` to `.heading-3`, `.metric`, `.body`, `.body-sm`, `.label`, `.caption`, `.overline`, `.mono`. |
| `packages/ui/src/styles/globals.css` | Imports the four files above, in that order. Exported as `@studio/ui/styles.css`. |
| `packages/ui/src/components/**/*.module.css` | Component styles, tokens only. |
| `apps/web/src/**/*.module.css` | Screen styles, tokens only. |

## Token layers

1. **Scales** hold raw values: `--color-gray-*` (blue-tinted ink), `--color-primary-*`
   (electric blue), `--color-cyan-*`, status hues, `--space-*`, `--radius-*`, `--font-size-*`.
   Screens and components should not read colour scales directly.
2. **Semantic tokens** say what a value is for: `--color-bg`, `--color-surface`,
   `--color-text`, `--color-primary`, `--color-border`, `--color-focus-ring`, `--shadow-*`,
   `--gradient-*`, `--control-height-*`. Each colour token is declared once with `light-dark()`,
   so light and dark sit side by side:

   ```css
   --color-text: light-dark(var(--color-ink-text), var(--color-ink-text-dark));
   ```

3. **Local custom properties** inside a component may take a token as their value
   (`--meter-fill: var(--color-warning)` in `CostMeter.module.css`). They never hold a literal.

## Light and dark mode

- `:root` sets `color-scheme: light dark`, so by default the theme follows the operating system.
- `data-theme="light"` or `data-theme="dark"` on `<html>` forces one theme.
- The owner's choice is stored in the `vs-theme` cookie (`system`, `light` or `dark`). The root
  layout (`apps/web/src/app/layout.tsx`) reads it on the server and renders `data-theme`, so the
  first paint is already right. No inline script is needed, which keeps the nonce-based CSP
  simple.
- `ThemeToggle` (`packages/ui/src/components/theme/`) is a three-way radio group in the studio top
  bar. It changes `data-theme` at once and rewrites the cookie for one year.

## Fonts

| Token | Font | Use |
|---|---|---|
| `--font-display` | Space Grotesk | Headings, logo |
| `--font-sans` | Inter | Body text, controls |
| `--font-mono` | JetBrains Mono | Code, ids, diffs |

The woff2 files are self-hosted, so the studio makes no font request to a third party.

## Rules for components and screens

- Use tokens for every colour, size, space, radius, shadow, blur, duration and easing.
- If a value you need has no token, add the token to `tokens.css` with its light and dark value,
  then add a row to `design/tokens.md`. Do not inline the value.
- Text over a colour uses the matching `on` token: `--color-text-on-primary` on `--color-primary`,
  `--color-on-brand` on `--gradient-control`.
- The bright `--gradient-brand` and `--gradient-rail` are decorative only. Never put text on them;
  white text on the cyan end is below 4.5:1. Buttons use `--gradient-control`.
- Focus is always visible: `--focus-ring-*` outlines or the `--shadow-focus-halo*` shadows.
- UI copy is pt-BR.

## Allowed literals

| Literal | Why it stays |
|---|---|
| `1px` hairline borders | A token would add no meaning. |
| Pixel values in `@media` queries | Custom properties do not work in media queries. |
| `0`, `100%`, `50%`, `transparent`, `currentColor` | Not design values. |
| Inline `style={{ width: '<n>%' }}` in `CostMeter` | A data-driven percentage, not a design value. |
| `#000000` / `#FFFFFF` in `apps/web/src/features/catalog/asset-form/kind-details-model.ts` | Default brand-kit colours the owner edits as data; they are not UI styling. |

`apps/shell` is an Electron menu-bar app with no window, so it has nothing to theme.

## Checking the rules

Run these from the `video-studio` folder. Each should print only the allowed cases above.

Colour literals outside `tokens.css`:

```bash
grep -rnE '#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(' packages/ui/src apps/web/src apps/shell/src --include='*.css' --include='*.tsx' --include='*.ts' | grep -v 'styles/tokens.css'
```

Raw lengths in stylesheets (anything other than `1px` and media queries):

```bash
grep -rnE '[^-a-z0-9.][0-9]+(\.[0-9]+)?(px|rem|em)\b' packages/ui/src apps/web/src --include='*.css' | grep -v 'styles/tokens.css' | grep -v '@media' | grep -vE '\b1px\b'
```

Every `var(--…)` used is defined:

```bash
perl -ne 'print "$1\n" while /var\((--[a-z0-9-]+)/g' $(find packages/ui/src apps/web/src -name '*.css') | sort -u > /tmp/used.txt
perl -ne 'print "$1\n" while /(--[a-z0-9-]+)\s*:/g' $(find packages/ui/src apps/web/src -name '*.css') | sort -u > /tmp/defined.txt
comm -23 /tmp/used.txt /tmp/defined.txt
```
