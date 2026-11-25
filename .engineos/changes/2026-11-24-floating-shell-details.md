---
name: 2026-11-24-floating-shell-details
status: active
owner: Claude (supervisor) for the owner
spec: n/a — fast change chosen by the owner; layout details only, no new behaviour
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The private shell takes the layout details of the owner's Remote Radar screen, with this app's own
colours: a floating navigation rail on desktop, a capsule top bar, rounder cards and controls, and
the catalog section tabs as a capsule floating at the bottom of the window.

## Why
The owner sent a screenshot of Remote Radar and asked: "look at this design (not colors but details)
apply to our project".

## Scope
`packages/ui` (AppShell, Card, Control, tokens), `apps/web/src/features/shell/StudioNavigation.tsx`,
`apps/web/src/app/(studio)/layout.tsx`, `apps/web/src/features/catalog` (tab list styles and
`CatalogKindTabs`), `design/tokens.md`. Colour tokens, page content and the API are unchanged.

## Checklist
- [x] Owner chose all four details, "Rail on desktop, drawer on mobile (Recommended)" and
      "Fast change (supervisor) (Recommended)"
- [x] Desktop rail (1024px and up): icon over label, current page as a pill, last item opens the
      drawer, which keeps Preferences and the account; the top bar's menu button is hidden there
- [x] Drawer stays the navigation below 1024px; focus returns to whichever button opened it
- [x] Top bar: capsule from 768px up, rounded card on phones where the status wraps to two rows
- [x] Radius tokens: md 10 to 12, lg 16 to 20, xl 20 to 24, new 2xl 28; new rail width and item
      height tokens; `design/tokens.md` updated
- [x] Card radius 2xl with a deeper shadow; text controls get a soft shadow
- [x] Catalog section tabs: opaque capsule fixed at the bottom centre, scrolls sideways on phones,
      panel padded so the last row is not covered
- [x] Seen in the live dev app (4310): Runs, Catalog top and bottom, Insights at 1440px; Catalog at
      375px; drawer opened from the rail and closed with Escape
- [ ] Typecheck, lint and tests: not run (waits for the owner's go-ahead)

## What was made
- `AppShell` takes a `rail` slot and exports `railLinkClassName`; `StudioNavigation` has a `rail`
  variant that lists the same destinations flat.
- Control borders keep `--color-border-strong` for contrast; the reference uses softer borders.
- The radius change is global: every component that reads those tokens is rounder.
- Known dev-only overlap: the Next dev badge sits over the left end of the floating tabs on phones.
