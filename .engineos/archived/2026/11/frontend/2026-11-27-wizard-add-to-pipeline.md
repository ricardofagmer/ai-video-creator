---
name: 2026-11-27-wizard-add-to-pipeline
status: done
completed: 2026-11-27
owner: ricardofagmer
spec: n/a — Fast change (supervisor) chosen by the developer in the simple-task lane
domain: frontend
security_review: not-required
risk: medium
new_feature: true
release: false
---

## What
The `/criar` wizard has a new "Add to pipeline" step after References. In it the owner adds catalog sites, skills, video templates, prompts, AI models and media/brand assets (music, effects, brand kits) to the run. The writer and director agents receive them.

## Why
The owner asked to add sites, skills, video templates, prompts, AI & writing and media & brand items "straight to this pipeline" from the wizard, without leaving it for the catalog.

## Scope
- Web wizard: steps, draft, new pipeline helpers, new step component, flow wiring, CSS, en/pt-BR/es messages.
- Watcher: `readOwnerReferences` now passes prompts, skills and other non-reference kinds to the agent packets.
- Core: `OWNER_REFERENCES_MAX` raised from 8 to 16.

## Checklist
- [x] Add a `pipeline` step after `references` in the wizard step list
- [x] Store `pipelineItems` in the wizard draft (schema default `[]`)
- [x] Build the step with six tabs over the catalog search, add and remove
- [x] Send the items as run references (shared 50-ref cap)
- [x] Pin the first template, brand kit and music to the recipe unless the owner chose that slot
- [x] Pass prompt and skill text, and other kinds by name and summary, to the writer and director
- [x] Messages in en, pt-BR and es
- [x] Check the step in the browser on 4310

## What was made
- Added `apps/web/src/features/wizard/wizard-pipeline.ts`: tabs, tab kinds, the Sites filter, recipe pins from items, and the merged run reference list capped at 50.
- Added `apps/web/src/features/wizard/components/WizardPipelineStep.tsx`: six tabs, catalog grid with Add, "Added to the pipeline" list with Remove.
- Wired the step in `WizardFlow.tsx`; the style and review steps show the implied pins; `start()` sends `runReferencesOf(references, pipelineItems)`.
- Added the `pipeline` step to `wizard-steps.ts` and `pipelineItems` to `wizard-draft.ts`.
- Added the `.pipelineRow` style and the `pipeline` message block in three languages.
- Watcher `readOwnerReferences` now reads prompt file text and skill entry text, and passes templates, models, music, effects and brand kits by name and summary.
- Raised `OWNER_REFERENCES_MAX` to 16 so added items fit beside references.
- Rebuilt the watcher dist with `turbo build --filter=@studio/watcher...`.

## Not done
- Tests were not run; the developer chose "Skip for now".
- The running repo watcher (PID 16602) still runs the old build; restarting it was not approved yet.

## User checklist
- [ ] Run the tests for web, watcher and core when ready
- [ ] Restart the repo watcher (PID 16602) so runs use the new owner-references code
- [ ] Clear the test draft "Pipeline step check" in the wizard
- [ ] Stage the record move and the changed files when committing

## Verification
- ran: `pnpm --filter @studio/web typecheck` exit 0 (2026-11-27)
- ran: `pnpm --filter @studio/watcher typecheck` exit 0 (2026-11-27)
- ran: `turbo build --filter=@studio/watcher...` exit 0 (2026-11-27)
- Browser on http://127.0.0.1:4310/criar: six tabs shown, Sites and Templates load, Add, chosen list and Remove work, template pin shows in "Voice and style", no console errors.
- `pnpm --filter @studio/core typecheck` fails only in pre-existing test files not touched here (`slot-decision.test.ts`, `seed.test.ts`, `catalog.test.ts`, `recipes.test.ts`, `runs.test.ts`).

## Human decisions
- 2026-11-27 | ricardofagmer | planning choice | approved | "Fast change (supervisor)"
- 2026-11-27 | ricardofagmer | final checks | refused for now | "Skip for now" on running tests
- No hitl.required reason fired.

## Changes registered
- 9 files modified, 2 files added, no renames or moves; uncommitted in the working tree.

```
 M apps/watcher/src/stages/shared/owner-references-input.ts
 M apps/web/src/features/wizard/components/WizardFlow.tsx
 M apps/web/src/features/wizard/wizard-draft.ts
 M apps/web/src/features/wizard/wizard-steps.ts
 M apps/web/src/features/wizard/wizard.module.css
 M apps/web/src/messages/wizard/en.ts
 M apps/web/src/messages/wizard/es.ts
 M apps/web/src/messages/wizard/pt-BR.ts
 M packages/core/src/agents/packets/generator.packets.ts
?? apps/web/src/features/wizard/components/WizardPipelineStep.tsx
?? apps/web/src/features/wizard/wizard-pipeline.ts

 .../src/stages/shared/owner-references-input.ts    | 37 +++++++++++++++++---
 .../src/features/wizard/components/WizardFlow.tsx  | 36 +++++++++++++++----
 apps/web/src/features/wizard/wizard-draft.ts       | 16 ++++++++-
 apps/web/src/features/wizard/wizard-steps.ts       |  4 +--
 apps/web/src/features/wizard/wizard.module.css     | 40 +++++++++++++++++++++-
 apps/web/src/messages/wizard/en.ts                 | 14 ++++++++
 apps/web/src/messages/wizard/es.ts                 | 14 ++++++++
 apps/web/src/messages/wizard/pt-BR.ts              | 14 ++++++++
 .../core/src/agents/packets/generator.packets.ts   | 13 +++++--
 9 files changed, 171 insertions(+), 17 deletions(-)
```

## Notes
- The worktree holds many unrelated changes from other sessions; only the files above belong to this change.
