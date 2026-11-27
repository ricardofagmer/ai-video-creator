---
name: 2026-11-27-preset-editor-format-presets
status: done
completed: 2026-11-27
owner: Ricardo
spec: n/a — follow-up of wizard-format-presets reusing its preset list; one form card plus labels
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The preset editor's Format card (New preset / edit preset, step "Format") offers the same suggested formats as the "Criar vídeo" wizard: YouTube, YouTube Shorts, Instagram Reels/Stories, Instagram square, Facebook Reels/Stories, Facebook square, TikTok, Traditional 16:9 and Custom.

## Why
The owner opened New preset expecting the format suggestions and found only raw width, height and FPS fields; the suggestions existed only in the wizard's "Voice and style" step.

## Scope
- apps/web/src/features/recipes/components/RecipeBasicsSections.tsx (RecipeFormatSection)
- apps/web/src/features/wizard/wizard-format.ts (presetOfSize, presetHasSize)
- apps/web/src/messages/recipes/{en,pt-BR,es}.ts (format.preset, format.presetHelp)
- apps/web/src/features/wizard/components/{WizardFormatFields,WizardPipelineStep}.tsx (type-assertion lint fix)

## Checklist
- [x] Suggested-format select above width, height and FPS
- [x] Picking a suggestion fills width, height and FPS
- [x] Typing a size that fits no suggestion shows Custom
- [x] A picked suggestion that shares its size with another (TikTok and Shorts) stays shown
- [x] Labels in en, pt-BR and es

## What was made
- Added a "Suggested format" select to RecipeFormatSection; it fills the form's width, height and fps and is derived from them, with the picked id kept while the size still fits it.
- Extracted presetOfSize and added presetHasSize in wizard-format.ts; formatOfRecipe uses presetOfSize.
- Added format.preset and format.presetHelp messages in en, pt-BR and es.
- Replaced the `as readonly string[]` assertions in isPresetId (WizardFormatFields, RecipeBasicsSections) and isPipelineTab (WizardPipelineStep) with `.some(...)`, clearing the consistent-type-assertions lint error.

## Not done
nothing

## User checklist
- [ ] Commit this change together with the wizard format presets
- [ ] Run the web tests at the final gate

## Verification
- ran: `./node_modules/.bin/tsc --noEmit -p .` exit 0 (2026-11-27)
- ran: `./node_modules/.bin/eslint src/features/recipes src/features/wizard` exit 0 (2026-11-27)
- Browser, http://127.0.0.1:4310/receitas/nova step Format: default 1920x1080 shows YouTube; TikTok fills 1080x1920@30 and stays TikTok; Facebook Reels stays Facebook Reels; typing width 1200 shows Custom; YouTube fills 1920x1080. Nothing saved.

## Human decisions
2026-11-27 | Ricardo | none fired | approved | answered "Yes, add them" to adding the presets to the preset editor

## Changes registered
- 5 tracked files modified, 46 insertions, 4 deletions (apps/web)
```
 M apps/web/src/features/recipes/components/RecipeBasicsSections.tsx
 M apps/web/src/features/wizard/components/WizardPipelineStep.tsx
 M apps/web/src/messages/recipes/en.ts
 M apps/web/src/messages/recipes/es.ts
 M apps/web/src/messages/recipes/pt-BR.ts
 (wizard-format.ts and WizardFormatFields.tsx are still untracked from the wizard format change)
 .../recipes/components/RecipeBasicsSections.tsx    | 42 ++++++++++++++++++++--
 .../wizard/components/WizardPipelineStep.tsx       |  2 +-
 apps/web/src/messages/recipes/en.ts                |  2 ++
 apps/web/src/messages/recipes/es.ts                |  2 ++
 apps/web/src/messages/recipes/pt-BR.ts             |  2 ++
 5 files changed, 46 insertions(+), 4 deletions(-)
```

## Notes
The select is not stored in the recipe; the recipe keeps only canvas, aspect and fps.
