---
name: 2026-11-24-cart-kit-and-badge-fields
status: done
completed: 2026-11-24
owner: Ricardo Fagmer
spec: n/a — Fast change chosen by the developer; UI restyle plus one reusable form control, no new domain behaviour
domain: frontend
risk: low
new_feature: false
release: false
---

## What
Restyled the "Carrinho de assets" dialog in the Skills page's look, without the empty gap inside each tile and with a video-kit illustration. Added a badge input: pressing Enter (or typing a comma in comma-separated lists) turns the typed entry into a badge. It is used in every list-shaped text field.

## Why
The developer asked for a more striking cart that saves space, and for keywords to become badges on Enter across the system.

## Scope
- Cart: `apps/web/src/features/cart/components/{CartButton,CartItemTile,CartKitBanner}.tsx`, their CSS modules, `apps/web/src/features/cart/cart-kind-artwork.ts`, and the cart messages (pt-BR, en, es).
- Badge input: `packages/ui/src/components/form/TagInput.{tsx,module.css}` and its export in `packages/ui/src/index.ts`.
- Fields switched to badges: `RunBriefFields.tsx` (key messages), `IdentitySection.tsx` (catalog tags), `PublishMetadataFields.tsx` (publish tags), `kind-detail-fields.ts` and `KindDetailsSection.tsx` (camera moves, transitions).
- Messages: common `tagInput.remove`, plus the help texts in runs, catalog and publishing (pt-BR, en, es).

## Checklist
- [x] Remove the forced square tile, which left the empty band
- [x] Skills-style tone gradients and a glyph lens per asset kind
- [x] Kit banner with an animated cart, clapperboard, reel and waveform (motion respects reduced motion)
- [x] Reusable TagInput that keeps each form model's stored string format (line or comma)
- [x] Wire it to key messages, catalog tags, publish tags, camera moves and transitions
- [x] Update help texts in pt-BR, en and es
- ~~Visual check on 4320~~ — skipped by the developer: the API on 4311 answers 403 to sign-ins from the 4320 origin

## What was made
- The cart tiles became compact poster cards: a tone gradient edge, a glyph lens, the name clamped to 2 lines and a footer with a top border. The forced 1:1 square was removed, so the empty band is gone. The grid is now `minmax(8.5rem, 1fr)` with a bounded scroll height, so the dialog's buttons stay in view.
- Added `CartKitBanner`: eyebrow, description and item-count pill, plus an inline SVG video-kit illustration in the brand gradient with film perforations.
- Added `TagInput` to @studio/ui:
  - Enter commits the typed text as a badge (a comma does too in comma lists). Duplicates are skipped.
  - Backspace in an empty field takes the last badge back for editing. Pasted text is split into badges. Leaving the field commits what was typed.
  - Each badge has a labelled × button.
- Switched to `TagInput`: run key messages (line-separated), catalog tags, publish tags, and the template's camera moves and transitions (comma-separated).

## Not done
- The visual check in the running app (developer chose to skip it; see Notes).
- Lint was not run (final check skipped for now).
- Prompt-variable default values were left as plain text on purpose: whether they are a list depends on the variable type.

## User checklist
- [ ] Open the cart dialog and a badge field in the app once, and confirm they look right. They were never seen running.
- [ ] Run lint on apps/web and packages/ui when convenient.
- [ ] Commit the change when ready (git writes ask first).

## Verification
- ran: `cd apps/web && npx tsc --noEmit -p .` exit 0 (2026-11-24)
- ran: `cd packages/ui && npx tsc --noEmit -p .` exit 0 (2026-11-24)
- Visual check skipped by the developer; lint skipped for now at the final checkpoint.

## Human decisions
- 2026-11-24 | Ricardo Fagmer | none required (low risk, no hitl reasons fired) | approved | Chose Fast change. Chose to skip the visual check. Chose to skip the final checks for now.

## Changes registered
```
 M apps/web/src/features/catalog/asset-form/IdentitySection.tsx
 M apps/web/src/features/catalog/asset-form/KindDetailsSection.tsx
 M apps/web/src/features/catalog/asset-form/kind-detail-fields.ts
 M apps/web/src/features/publishing/components/PublishMetadataFields.tsx
 M apps/web/src/features/runs/components/RunBriefFields.tsx
 M packages/ui/src/index.ts
?? apps/web/src/features/cart/
?? apps/web/src/messages/{cart,catalog,common,publishing,runs}/
?? packages/ui/src/components/form/TagInput.module.css
?? packages/ui/src/components/form/TagInput.tsx

 .../catalog/asset-form/IdentitySection.tsx         |  32 ++++---
 .../catalog/asset-form/KindDetailsSection.tsx      |  15 ++-
 .../catalog/asset-form/kind-detail-fields.ts       | 105 +++++++++++----------
 .../components/PublishMetadataFields.tsx           |  41 +++++---
 .../features/runs/components/RunBriefFields.tsx    |  26 +++--
 packages/ui/src/index.ts                           |  23 ++++-
 6 files changed, 146 insertions(+), 96 deletions(-)
```
- Touched: 6 modified files, plus new cart components, a new TagInput and new message folders; no renames or moves.
- The working tree also holds earlier, uncommitted work from other change records. The untracked directories and part of the stat above include files from those changes as well.

## Notes
- The dev web on 4320 can't sign in while the API on 4311 keeps its default `ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN` (4310). Signing in from 4320, including `/login/dev`, gets a 403. To check UI on 4320, run a second dev API whose origin is 4320. [[web-build-breaks-dev-server]]
