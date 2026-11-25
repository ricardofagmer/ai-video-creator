---
name: 2026-11-24-wizard-references-modal-optional-preset
status: active
owner: Ricardo Fagmer
spec: n/a — Fast change (supervisor) chosen by the developer; small UI change in one feature folder
domain: frontend
risk: low
new_feature: false
release: false
---

## What
Two changes to "Create video": a button on step 2 (Preset) that opens the reference picker in a dialog, and an optional Preset step.

## Why
The owner wants to add references while composing without going back to step 1, and does not want the Preset step to block the flow.

## Scope
- `apps/web/src/features/wizard/components/WizardRecipeStep.tsx`
- `apps/web/src/features/wizard/components/WizardFlow.tsx`
- `apps/web/src/messages/wizard/{en,es,pt-BR}.ts`

## What was made
- Step 2 has an "Add references" button showing how many are chosen. It opens a wide dialog with the same picker as step 1; the dialog edits the same draft references.
- The Preset step is optional: a draft with no preset takes a default one (the first active version, else the first runnable one), so "Next" always passes. A draft restored from the session keeps its own preset.
- The step 2 description says the preset is optional and already selected, in English, Portuguese and Spanish.

## Not done
nothing

## Checklist
- [x] References dialog on step 2
- [x] Optional Preset step (default preselected)

## User checklist
- [ ] Approve and run `pnpm typecheck` and `pnpm lint`.

## Human decisions
- 2026-11-24, Ricardo Fagmer: button place = "Step 2 only"; planning = "Fast change (supervisor)"; skipped-preset behaviour = "Provide details", then "Preselect a default". No HITL reason id fired.

## Verification
- [validation] pending — final-stage user approval required.
- Checked in Chrome on port 4310 (dev server): the button opens the dialog; a search lists catalog items; adding one changed the label from "Add references (1 chosen)" to "Add references (2 chosen)", removing it restored the count; "Done" closes the dialog.
- Checked in Chrome on port 4310 in a new tab with an empty session: the draft started with `carrinho-completo-9x16@3` and a 30 s target; step 2 showed that preset checked among 18 and the new description; "Next" went Idea, References, Preset, Voice and style with no "Choose the base preset." error.

## Changes registered
Not a git repository; files are listed under Scope.
