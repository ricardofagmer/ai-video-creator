---
name: 2026-11-23-asset-cart
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-23-asset-cart-and-checkout-design.md
domain: frontend
risk: medium
new_feature: true
release: false
---

## What
A browser-local asset cart. Catalog items are added from the cards and the asset page, the cart fills the slots of a new or existing receita, and "Salvar e criar vídeo" opens a new run with the receita and the leftover cart items as references.

## Why
The user wants to walk the catalog adding everything to a cart, use it in a receita, and start a video with all selected assets.

## Scope
- New: apps/web/src/features/cart/{cart-store.ts, cart-bindings.ts, cart-item.ts}, components/{CartButton.tsx, CartButton.module.css, CartToggleButton.tsx}
- New: apps/web/src/messages/cart/{pt-BR.ts, en.ts, es.ts}; wired into messages/{pt-BR,en,es}.ts
- Edited: packages/ui/src/components/icon/Icon.tsx (cart icon), app/(studio)/layout.tsx (navbar button), catalog CatalogAssetItem.tsx and AssetDetailView.tsx (toggle button), recipes RecipeEditor.tsx (apply cart, save and create video), runs NewRunForm.tsx (cart references)

## Scope — part 2 (skills + checkout, 2026-11-23)
- Shared: packages/shared/src/agents/writer.ts (`skillText` → `skillTexts[]`, `WRITER_SKILLS_MAX` = 5)
- Core: packages/core/src/agents/packets/generator.packets.ts, prompts/writer.prompt.ts (`writer@3`)
- Watcher: stages/shared/catalog-lookup.ts (`skillEntryText`), stages/agents/packet-sources.ts (`boundSkillTexts`), stages/executors/script.executor.ts
- Web: cart/{cart-bindings.ts, components/CartButton.tsx, CartButton.module.css}, recipes/{recipe-slots.ts, recipe-form-model.ts, binding-options.server.ts, components/RecipeEditor.tsx, components/RecipeWriterSkillsSection.tsx(+css)}, skills/components/SkillList.tsx, skills.module.css, messages/{cart,recipes}/{pt-BR,en,es}.ts
- UI: packages/ui icon glyphs trash, broom, plus, arrow-right

## Checklist
- [x] Cart store in localStorage (max 50 items, type-guarded)
- [x] Add/remove button on catalog cards and the asset page
- [x] Navbar cart button with count and review dialog
- [x] Auto-fill receita slots from the cart (active versions only)
- [x] "Salvar e criar vídeo" to /execucoes/nova with cart references (biometric excluded)
- [x] pt-BR, en, es texts
- [ ] Typecheck and browser walkthrough (user chose "Skip for now")
- [x] Spec doc for the feature (docs/specs/2026-11-23-asset-cart-and-checkout-design.md)
- [x] Skills can be added to the cart from the /skills cards
- [x] Checkout step in the cart dialog grouped by destination
- [x] Cart skills bound as `skill:writer` (max 5), shown and removable in the receita editor
- [x] Writer packet carries every bound writer skill; script stage reads each SKILL.md (never biometric)
- [x] Icons: trash (Tirar), broom (Esvaziar), plus (Criar receita), arrow (Finalizar)
- [ ] Typecheck, lint, watcher/core tests and browser walkthrough of the new part

## What was made
Built the cart feature as scoped above. Cart items fill single-slot kinds (template, voice, brand kit, music) by replacement and empty prompt slots in stage order; items that cannot be pinned are reported as skipped and passed to the run as references.

## Not done
- Typecheck, lint and browser walkthrough: not run; the user chose "Skip for now".
- Writer packet/prompt tests not updated or run (tests wait for the final gate).
- Possible Suspense boundary needed around useSearchParams on /receitas/nova and /execucoes/nova; card layout with the new button not seen.

## User checklist
- [ ] Approve the typecheck and the browser walkthrough of catalog → cart → receita → nova execução
- [ ] Approve checks for part 2 (typecheck, lint, core/watcher tests, browser walkthrough of /skills → cart → Finalizar → receita)

## Verification
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-23 | Ricardo | none of the hitl reasons fired | — | design choices answered through clickable questions: browser storage, auto-fill then adjust, new + existing receita + go to new video, card + asset page + nav badge; checks: "Skip for now"

- 2026-11-23 | Ricardo | none of the hitl reasons fired | — | part 2 answers: writer gets several skills, checkout step in the cart dialog, other items stay run references, "build it" (no preview); asked for icons (trash, broom, create)

- 2026-11-23 | Ricardo | none of the hitl reasons fired | — | part 2 final checks: "Not now" (typecheck, lint, core/watcher tests, browser walkthrough stay pending)

## Changes registered
```
 M apps/web/src/app/(studio)/layout.tsx
 M apps/web/src/features/catalog/components/CatalogAssetItem.tsx
 M apps/web/src/features/recipes/components/RecipeEditor.tsx
 M apps/web/src/features/runs/components/NewRunForm.tsx
?? apps/web/src/features/cart/
?? apps/web/src/features/catalog/views/AssetDetailView.tsx
?? apps/web/src/messages/
?? packages/ui/src/components/icon/

 apps/web/src/app/(studio)/layout.tsx               | 36 +++++---
 .../catalog/components/CatalogAssetItem.tsx        | 39 +++++++--
 .../features/recipes/components/RecipeEditor.tsx   | 98 ++++++++++++++++++----
 .../src/features/runs/components/NewRunForm.tsx    | 52 ++++++++----
 4 files changed, 179 insertions(+), 46 deletions(-)
```
The diff stat also includes earlier uncommitted work on these files (untracked directories hold files from other changes too).

## Notes
Record stays active until verification runs and a spec is linked.
