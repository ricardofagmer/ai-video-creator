---
name: 2026-11-24-cart-square-tiles
status: active
owner: Claude (supervisor) for the owner
spec: n/a — fast change chosen by the owner; layout and styling of one dialog, no new behaviour
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The "Carrinho de assets" dialog shows each item as a small square tile, three per row, instead of
one tall full-width row per item.

## Why
The owner sent a screenshot and asked: "this is being created too large, make small square and
improve this design".

## Scope
`apps/web/src/features/cart/components` and the three `apps/web/src/messages/cart` files.

## Checklist
- [x] Owner chose "Small square cards (Recommended)" and "Fast change (supervisor) (Recommended)"
- [x] Tile component and styles; old row styles removed
- [x] Short tag texts in pt-BR, en and es
- [x] Seen in the app on the dev server (127.0.0.1:4320): 2 items and 10 items

## What was made
- Follow-up the same day, at the owner's request ("remove this ig-dfdrn7xgi3g@2 from the squares"):
  the ref line was removed from every tile and the name may now take three lines. Seen in Chrome at
  127.0.0.1:4320 with 11 items: no ref shown, tiles 132x132, no name cut.
- `CartItemTile`: kind, name (full name as tooltip), a one-word tag for
  where the item goes (`receita`, `roteirista`, `referência`, `não ativa`, `de fora`) with the full
  sentence as tooltip and as hidden text for screen readers, and an icon-only remove button.
- The list is a grid of square tiles. About three rows stay in view and the list scrolls inside
  itself, so the title and the footer buttons stay on screen.
- Measured in Chrome at 1920x928: tiles 137x137 (132x132 with the scrollbar), dialog 480x353 with
  2 items and 480x652 with 10; no tile, kind or tag was cut; the dialog itself did not scroll.

## Not done
- Not seen at a phone width or in the light theme.
- The installed desktop app (127.0.0.1:4310) runs a built copy and shows the old rows until the web
  is rebuilt and the app repackaged.

## User checklist
- [ ] Rebuild and repackage the desktop app when you want the new cart there

## Verification
[validation] pending — final-stage user approval required (web typecheck and lint)
Visual check done on 2026-11-24 in Chrome at 127.0.0.1:4320 (dev server): screenshot and measured
sizes above. The test items were removed from that cart afterwards.

## Human decisions
- 2026-11-24 | owner | none fired | approved | layout: "Small square cards (Recommended)"
- 2026-11-24 | owner | none fired | approved | planning: "Fast change (supervisor) (Recommended)"
- 2026-11-24 | owner | none fired | deferred | final checks (`tsc --noEmit` and `eslint .` in apps/web): "Skip for now". Nothing ran

## Changes registered
Not a git repository. Files:
- `apps/web/src/features/cart/components/CartItemTile.tsx` (new)
- `apps/web/src/features/cart/components/CartItemTile.module.css` (new)
- `apps/web/src/features/cart/components/CartButton.tsx` (list replaced by the tile grid)
- `apps/web/src/features/cart/components/CartButton.module.css` (`.list`, `.item`, `.itemText` removed)
- `apps/web/src/messages/cart/{pt-BR,en,es}.ts` (`tags`)
