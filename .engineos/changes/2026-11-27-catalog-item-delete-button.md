---
name: 2026-11-27-catalog-item-delete-button
status: active
owner: Ricardo Fagmer
spec: none (fast change, low risk)
domain: frontend
security_review: not-required
risk: low
new_feature: true
release: false
---

## What
Every catalog item has a "Delete" button, on its card and on its own page. After a confirmation it deprecates every version of the item, and the catalog lists no longer show items whose versions are all deprecated.

## Why
Owner request 2026-11-27: "add option to delete all item in catalog per item buton". The catalog never removes a row (ADR 0003: versions are immutable, foreign keys are `Restrict`, recipes pin `assetId@version`), so the owner chose "Discontinue all versions", "Hide from lists" and "Cards and item page".

## Scope
- `apps/web/src/features/catalog/discontinue-asset.ts` (new): `discontinueAsset` pages through an item's versions and deprecates each one through the existing status route; `listedAssetStatuses` (`draft`, `active`) is what a list asks for when no status is picked.
- `apps/web/src/features/catalog/components/DiscontinueAssetButton.tsx` (new): the button and its confirmation dialog.
- `apps/web/src/features/catalog/components/CatalogAssetItem.tsx`: the button in the card footer, after "Edit".
- `apps/web/src/features/catalog/views/AssetDetailView.tsx`: the button in the item page header; a delete goes back to `/catalogo`.
- `apps/web/src/app/(studio)/catalogo/page.tsx`, `apps/web/src/features/skills/components/SkillsCatalogPanel.tsx`, `apps/web/src/features/wizard/components/WizardPipelineStep.tsx`, `apps/web/src/features/wizard/components/WizardReferenceLibrary.tsx`: the list queries ask for `draft` and `active` unless the owner picked a status.
- `apps/web/src/messages/catalog/{pt-BR,en,es}.ts`: `deleteItem` texts.

No api, core or database schema change.

## Checklist
- [x] Delete button on every catalog card, in the footer's secondary small button style
- [x] Delete button on the item page
- [x] Confirmation dialog that says what happens and how to bring the item back
- [x] Lists hide items whose versions are all deprecated; the status filter "Deprecated" still shows them
- [x] Button and dialog seen in the app on the dev server
- [x] A real delete clicked in the app, on the test voice the owner named
- [ ] Final checkpoint (typecheck, lint)

## What was made
- "Delete" on a card or on the item page opens an alert dialog named after the item. "Delete" in the dialog reads every version of the item and sets each one that is not deprecated to `deprecated`, one call per version, through `PUT /catalog/assets/:assetId/versions/:version/status`.
- A failed call keeps the dialog open with the reason in the active language. Versions deprecated before the failure stay deprecated; confirming again finishes the rest.
- After a delete the card's page is refreshed; from the item page the owner lands on `/catalogo`.
- The catalog page, the catalog Skills page and the wizard's two library lists now ask the api for `draft` and `active` versions when no status is picked. Picking the status "Deprecated" in the filter bar lists deprecated versions as before, and a version is brought back with "Activate…" on its page.

## Not done
- No database row or stored file is removed: the catalog has no delete, by design.
- The search by meaning and the run form's pickers (`RunReferencesPicker`, `RunInstructionsField`) still list deprecated versions.
- The button also shows on an item whose versions are all deprecated already; there it changes nothing.
- The deprecation is one call per version, not one transaction.
- No typecheck, lint or test has run.
- `elevenlabs-test-voice@1` was left deprecated by the live test.

## User checklist
- [x] Confirm a real delete on a test item.
- [ ] Activate `elevenlabs-test-voice@1` again if the test voice is still wanted.
- [ ] Approve the final checks when wanted: `pnpm --filter @studio/web typecheck` and `pnpm --filter @studio/web lint`.

## Verification
Seen in the app on the dev server (127.0.0.1:4310, 2026-11-27): `/catalogo?secao=ia-e-escrita` shows "Delete" on 18 of 18 cards with the same classes as "Edit" (`secondary`, `sm`), and no card on the default list is deprecated; "Delete" on "Voz ElevenLabs" opens the dialog "Delete Voz ElevenLabs?" with "Cancel" and "Delete", and "Cancel" closes it; `/catalogo/elevenlabs-test-voice` shows "Delete" after "Activate…", its dialog opens and "Cancel" closes it; `/catalogo?secao=ia-e-escrita&tipo=skill` renders with no alert; `/catalogo?status=deprecated` lists the deprecated versions (2 video templates, 1 media and brand). No console error.
Live delete, with the owner's confirmation (2026-11-27): "Delete" confirmed on "ElevenLabs test voice" from `/catalogo?secao=ia-e-escrita`; the browser sent `GET .../catalog/assets/elevenlabs-test-voice/versions?limit=100` (200) and `PUT .../versions/1/status` (200); the dialog closed, the list went from 18 to 17 cards without the test voice; `/catalogo?secao=ia-e-escrita&status=deprecated` lists it; its page shows the badge "Deprecated" and "Activate…". No console error.
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-27 | Ricardo Fagmer | where the task runs | approved | "Do it here"
- 2026-11-27 | Ricardo Fagmer | what delete does | approved | "Discontinue all versions (Recommended)"
- 2026-11-27 | Ricardo Fagmer | after delete | approved | "Hide from lists (Recommended)"
- 2026-11-27 | Ricardo Fagmer | where the button shows | approved | "Cards and item page"
- 2026-11-27 | Ricardo Fagmer | planning | approved | "Fast change (supervisor) (Recommended)"
- 2026-11-27 | Ricardo Fagmer | live delete test | approved | "Yes, delete the test voice": `elevenlabs-test-voice@1` set to deprecated
- 2026-11-27 | Ricardo Fagmer | final checks | skipped | "Skip for now": typecheck and lint stay pending

No HITL reason fired.

## Changes registered
The working tree also holds other sessions' uncommitted work; only this change's lines are listed. Nothing is committed, no file was moved or renamed.

`git status --short` (2026-11-27, this change's files):
```
 M apps/web/src/app/(studio)/catalogo/page.tsx
 M apps/web/src/features/catalog/components/CatalogAssetItem.tsx
 M apps/web/src/features/catalog/views/AssetDetailView.tsx
 M apps/web/src/features/skills/components/SkillsCatalogPanel.tsx
 M apps/web/src/features/wizard/components/WizardReferenceLibrary.tsx
 M apps/web/src/messages/catalog/en.ts
 M apps/web/src/messages/catalog/es.ts
 M apps/web/src/messages/catalog/pt-BR.ts
?? apps/web/src/features/catalog/components/DiscontinueAssetButton.tsx
?? apps/web/src/features/catalog/discontinue-asset.ts
?? apps/web/src/features/wizard/components/WizardPipelineStep.tsx
```
`WizardPipelineStep.tsx` is untracked because another session created it; this change edited one query in it. `CatalogAssetItem.tsx`, `catalogo/page.tsx` and `SkillsCatalogPanel.tsx` also carry lines of `2026-11-27-skills-deck-real-cases`.

The record stays `status: active`: no check has run, so it cannot be marked done or archived yet.
