---
name: 2026-11-27-wizard-format-presets
status: done
completed: 2026-11-27
owner: ricardofagmer
spec: n/a — Fast change (supervisor) chosen by the developer; wizard-only, no core, shared or render change
domain: frontend
security_review: not-required
risk: low
new_feature: true
release: false
---

## What
The wizard's "Voice and style" step gains a "Video format" section: suggested formats (YouTube, YouTube Shorts, Instagram Reels/Stories, Instagram square, Facebook Reels/Stories, Facebook square, TikTok, traditional 16:9) or a custom width, height and fps. Only templates made for the chosen canvas and fps are offered.

## Why
The owner asked to set width, height and fps per video and to pick from familiar social formats instead of only taking the preset's format.

## Scope
apps/web wizard only: `wizard-format.ts` (new), `components/WizardFormatFields.tsx` (new), `wizard-draft.ts`, `wizard-recipe.ts`, `wizard-review.ts`, `components/WizardFlow.tsx`, `components/WizardStyleStep.tsx`, and the en, pt-BR and es wizard messages.

## Checklist
- [x] Format presets and custom size, limited to the 16:9, 9:16 and 1:1 aspects the recipe schema accepts
- [x] Draft field `format`, nullable with default null so older drafts still parse
- [x] composeRecipe applies canvas, aspect and fps; a changed format saves a new draft preset version
- [x] compositionKeyOf includes the format so a retry reuses the right saved version
- [x] Template list filtered by format; a mismatched template shows an error and the review lists the conflict
- [x] A custom size outside the accepted aspects keeps the owner on the step
- [x] Texts in en, pt-BR and es

## What was made
Added `wizard-format.ts` with the preset list, the check of a typed size against canvas, fps and aspect rules, and the template fit check. Added `WizardFormatFields` (preset select plus width, height and fps inputs, with a summary line and field errors) at the top of the Voice and style card. The draft stores the typed answer; the review resolves it and `composeRecipe` writes the format into the composed recipe, marking it changed. The template select only offers templates whose canvas, aspect and fps match. Checked in the browser on the live dev server (4310): YouTube Shorts preselected for a 1080x1920 preset; switching to YouTube left only a 16:9 template and flagged the preset's 9:16 template; 1920x1350 showed the aspect error and Next stayed on the step.

## Not done
4:5 (1080x1350) and 4:3 presets: the shared aspect enum allows only 16:9, 9:16 and 1:1; the owner chose to fit the current rules.

## User checklist
- [ ] Run the web test suite at the final gate (tests not run in this change)
- [ ] Start one run with a non-default format and confirm the rendered video size

## Verification
- ran: `./node_modules/.bin/tsc --noEmit -p apps/web` exit 0 (2026-11-27)
- Browser check on http://127.0.0.1:4310/criar: format section, template filter, mismatch error, invalid-size hold.

## Human decisions
| date | who | reasons | decision | note |
|---|---|---|---|---|
| 2026-11-27 | Ricardo | none | approved | "Fit current rules": presets only in 16:9, 9:16 and 1:1 plus Custom |

## Changes registered
- M apps/web/src/features/wizard/components/WizardFlow.tsx
- M apps/web/src/features/wizard/components/WizardStyleStep.tsx
- M apps/web/src/features/wizard/wizard-draft.ts
- M apps/web/src/features/wizard/wizard-recipe.ts
- M apps/web/src/features/wizard/wizard-review.ts
- M apps/web/src/messages/wizard/en.ts
- M apps/web/src/messages/wizard/es.ts
- M apps/web/src/messages/wizard/pt-BR.ts
- ?? apps/web/src/features/wizard/components/WizardFormatFields.tsx
- ?? apps/web/src/features/wizard/wizard-format.ts

```
8 files changed, 144 insertions(+), 14 deletions(-)  (plus 2 new files)
```

## Notes
Saved compositions from drafts made before this change have keys without the format suffix, so a retry from such a draft saves one extra preset version.
