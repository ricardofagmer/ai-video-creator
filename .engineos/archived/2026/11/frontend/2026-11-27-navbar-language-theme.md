---
name: 2026-11-27-navbar-language-theme
status: done
completed: 2026-11-27
owner: Ricardo Fagmer
spec: n/a — single-file layout change, no new feature
domain: frontend
risk: low
new_feature: false
release: false
---

## What
Move the language switch and the theme toggle from the menu drawer's Preferences section into the navbar.

## Why
The owner asked for both controls in the top bar, next to Cart and How to use.

## Scope
apps/web/src/app/(studio)/layout.tsx

## Checklist
- [x] Render `LanguageControl` and `ThemeToggle` in the AppShell `status` slot
- [x] Drop the `preferences` prop and the now-unused `Icon` import and `ui` binding
- ~~Browser check of the signed-in navbar~~ — sign-in never reached the browser pane; studio pages redirected to login

## What was made
- The studio layout now passes `<LanguageControl />` and `<ThemeToggle initialPreference={themePreference} />` inside the navbar status area, after CartButton and HelpButton.
- The `preferences` prop was removed, so the drawer's Preferences section no longer renders.

## Not done
Visual check of the signed-in navbar on desktop and phone width: the pane at 127.0.0.1:4310 never received a sign-in, so every studio page redirected to /login.

## User checklist
- [ ] Look at the navbar on desktop and phone width and confirm the controls fit and wrap cleanly.

## Verification
- [validation] not required — small change (1 files, risk low)

## Human decisions
none — no hitl.required fired (risk low).

## Changes registered
- modified: apps/web/src/app/(studio)/layout.tsx (no renames or moves)
```
 M apps/web/src/app/(studio)/layout.tsx
 apps/web/src/app/(studio)/layout.tsx | 10 ++++------
 1 file changed, 4 insertions(+), 6 deletions(-)
```

## Notes
The live `next dev` server on 4310 serves the edit; the checks gap is the sign-in only.
