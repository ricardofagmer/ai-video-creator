---
name: 2026-11-25-wizard-reference-modal
status: active
owner: Ricardo Fagmer
spec: none (fast change, low risk)
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The wizard button "Add a reference in the catalog" opens the catalog's References screen in a dialog on `/criar`. It no longer navigates.

## Why
Owner rule 2026-11-25: "this must not redirect or exit the screen, NEVER! it must open a modal window and keep in the page"; then, with a screenshot of the catalog References screen: "must open this screen".

## Scope
- `apps/web/src/features/wizard/components/WizardNewReferenceDialog.tsx` (new): the button and the dialog.
- `apps/web/src/features/wizard/components/WizardReferenceLibrary.tsx` (new): link box, filter bar, category tabs and cards, with filters in state.
- `apps/web/src/features/wizard/components/WizardLibraryCard.tsx` (new): the catalog card with no link and one "Add" action.
- `apps/web/src/features/wizard/components/WizardReferencesStep.tsx`: the link to `/catalogo/novo` is replaced by the dialog.
- `apps/web/src/features/catalog/components/CatalogFilterBar.tsx`: optional `onFiltersChange`, so the bar can run without the URL.
- `apps/web/src/features/catalog/components/SaveReferenceLinkForm.tsx`: optional `onSaved`, so a save can stay on the page.
- `apps/web/src/features/wizard/components/WizardReferenceItem.tsx`: the chosen reference name is plain text.
- `apps/web/src/features/catalog/components/ReferenceAnalysisCard.tsx`: `newVersionHref` may be null; the wizard passes null, so "attach file" is not offered there.
- `apps/web/src/messages/wizard/{pt-BR,es,en}.ts`: unused `openItem` text removed.

## Checklist
- [x] Button opens a dialog, URL stays `/criar`
- [x] Dialog shows the References screen
- [x] Cards add a reference to the video
- [x] Chosen references no longer link to the catalog
- [ ] Final checkpoint (typecheck, lint, tests)

## What was made
- The dialog holds "View a reference video" (paste a link, preview, "Save as reference"), search, Status, Sort by, Minimum score, Reviewed runs, "How the score is calculated", the category tabs and the reference cards.
- Each card has "Add"; it puts `assetId@version` on the wizard's list and the dialog stays open. A reference saved from a pasted link is added too.
- Nothing in the dialog is a link. The catalog page itself is unchanged.

## Not done
- "By meaning" search and "Favorites only" are not in the dialog (owner: "Rebuild in modal (Recommended)").
- Saving a new reference from a pasted link inside the dialog was not exercised (it writes to the catalog).
- No typecheck, lint or test has run.
- Biometric references are not listed in the dialog; a run cannot take them.
- A link-only reference on the wizard shows its notice without the "attach file" button; attaching the file is done from the catalog.

## Verification
Seen in the app on the dev server (127.0.0.1:4310, `/criar`, references step, 2026-11-25): click on the button opens the dialog, `location.pathname` stays `/criar`, 0 links inside the dialog; tabs "All 4 / Hooks 2 / Other 2", Hooks shows 2 cards; "Add" on `ig-dfdrn7xgi3g@2` turns to "Added" and the ref shows on the wizard list after "Close"; a pasted YouTube link shows the embed and the "Save as reference" form, URL still `/criar`. No console error.
Chosen references (same day, owner: "Yes, keep on page"): the name shows as plain text, 0 links to `/catalogo` in the wizard step, URL stays `/criar`.
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-25 | Ricardo Fagmer | modal build | approved | "Rebuild in modal (Recommended)"
- 2026-11-25 | Ricardo Fagmer | card click | approved | "Add to video (Recommended)"
- 2026-11-25 | Ricardo Fagmer | chosen references links | approved | "Yes, keep on page"
- 2026-11-25 | Ricardo Fagmer | final checks | skipped | "Skip for now": typecheck, lint and tests stay pending

## Changes registered
<filled on completion>
