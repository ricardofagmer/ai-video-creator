# Fagmer design system in Video Studio — design

Date: 2026-11-22 · Domain: frontend · Risk: low

## Problem

Video Studio's web UI used its own slate and violet palette and system fonts. The owner's apps follow
the design language of the fagmertech site (`fagmertech/site/css/site.css`), and Video Studio must
match it, in light and dark mode.

## Chosen approach

Keep the existing token architecture (`packages/ui/src/styles/tokens.css`, one `light-dark()`
declaration per semantic token, no colour literals outside that file) and keep every token name.
Change only the values, so all components follow without per-screen edits:

- Ink scale = the site's navy neutrals (`--ft-void`, `--ft-panel`, `--ft-line`, `--ft-muted`,
  `--ft-text`), plus a derived blue-tinted light end.
- Primary = electric blue (`#2563FF` light, `#60A5FA` dark); accent = cyan.
- New tokens: brand, rail, control and page gradients; glass surface; glow border and shadows;
  `--color-on-brand`; `--font-display`.
- Fonts: Space Grotesk (titles), Inter (body), JetBrains Mono (navigation, eyebrows, table
  headers, code), self-hosted from the site's woff2 files.
- Signature touches: floating glass top bar with gradient rail, beam underline on navigation,
  gradient primary button and logo, faint grid and halos behind the page.
- Theme: a three-way `ThemeToggle` (system, light, dark) stores the choice in the `vs-theme`
  cookie; the root layout reads it and renders `data-theme`, so no inline script (the CSP is
  nonce-based) and no flash.

Light mode is derived, because the site is dark only.

## Rejected alternatives

- **Replace token names with the site's `--ft-*` names.** Rejected: every component and the
  documented contract in `design/tokens.md` would change for no visual gain.
- **Inline theme script in `<head>` reading `localStorage`.** Rejected: needs the per-request CSP
  nonce plumbed into the layout; a cookie read on the server is simpler and flash-free.
- **Use the bright brand gradient (ending in `#22D3EE`) behind button text.** Rejected: white text
  on the cyan end falls below 4.5:1; controls use a darker control gradient instead.

## Login

`/login` follows the fagmertech landing layout (`fagmertech/site/index.html` hero), in
`apps/web/src/features/auth/login.module.css`:

- Floating glass top bar with the gradient rail (same as the studio shell), holding the logo and the
  theme toggle; slow-drifting aurora halos behind the page (stopped under reduced motion).
- Split hero from 1024px: left, a mono chip "Painel local · este Mac" with a status light (green
  pulse, amber when the local API does not answer), a display headline with gradient words
  (primary to accent, which keeps large-text contrast in both themes), a lead line and a fact list
  (`<dl>`: access, files, network, worded from the README); right, the sign-in card with a gradient
  edge and a soft halo, a mono eyebrow above the page's single h1 "Entrar", and a footnote on where
  the password goes.
- One column below 1024px, ordered intro, card, facts, so the form stays near the top on a phone.
- Behaviour, copy of the form and accessibility of `design/telas/01-layout-e-login.md` unchanged.

Rejected: **keep the centred single card and only restyle it.** It matched the old layout but not
the landing page's hero, which is the pattern the owner asked for.

## Acceptance

- Every screen reads only tokens; no new colour literals outside `tokens.css`.
- Light and dark both keep text contrast at or above 4.5:1.
- The toggle switches the theme at once and the choice survives reloads.
- `@studio/ui` and `@studio/web` typecheck.
