---
name: 2026-11-23-images-prompts-run-instructions
status: active
owner: Claude (supervisor) for the owner
spec: docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md
domain: frontend
security_review: pending
risk: medium
new_feature: true
release: false
---

## What
The catalog gets two new top-level sections, Imagens and Prompts. In Imagens the owner saves an image
by file upload or by an `https:` link, shown as a thumbnail. In Prompts the owner saves a named prompt
text. At cart checkout and on the new-run form an "Instruções para a IA" box (up to 2,000 characters)
can be typed or filled from a saved prompt. The planner, writer and director receive it as delimited,
untrusted owner text.

## Why
The owner asked: "add a tab in catalogo to sabe my images, can be the file or a link that i can also add
to the cart to produce my video, also at the checkout or new execution i can add a customizable prompt
to ia follow on this creation, and the same add a section to save my prompt in the catalog too".
Answers given: "Own sections (Recommended)", "keep the link but load a preview as tumblr", "Text box +
saved prompts (Recommended)", "implement it".

## Scope
- `packages/shared`:
  - `recipes/brief.ts`: `BRIEF_INSTRUCTIONS_MAX` and optional `instructions`.
  - `agents/director.ts`: optional `ownerInstructions`.
  - Catalog limits: an image may be `text/plain`.
  - Prompt versions: planner@2, writer@4, director@3.
- `packages/core`:
  - `agents/packets/generator.packets.ts`: delimited `ownerInstructions`.
  - Skill entry file read serves prompt text.
- `apps/watcher/src/stages/executors/scenes.executor.ts`: passes `brief.instructions` to the director.
- `apps/web`, catalog:
  - Changed: `catalog-sections.ts`, `catalog-tab-items.ts`, `catalogo/page.tsx`, `CatalogAssetItem.tsx`, `NewAssetView.tsx`, `AssetForm.tsx`, `catalog.module.css`.
  - New: `image-link-draft.ts`, `prompt-draft.ts`, `ImageLinkBox.tsx`, `NewPromptForm.tsx`.
- `apps/web`, runs and cart:
  - New: `cart/cart-instructions-store.ts`, `runs/components/RunInstructionsField.tsx`.
  - Changed: `cart/cart-store.ts`, `cart/components/CartButton.tsx`, `runs/components/NewRunForm.tsx`.
- `apps/web/src/middleware.ts`: CSP `img-src 'self' https:` for link thumbnails.
- Messages `catalog/*` and `runs/*` in pt-BR, en and es.

## Checklist
- [x] Spec with acceptance criteria AC1–AC7
- [x] Imagens and Prompts as own catalog sections
- [x] Image by link: https only, no credentials, browser thumbnail, stored as a third-party draft
- [x] Image by file: "Enviar arquivo" opens the new-item form with the image kind chosen
- [x] Prompt form saves a draft prompt (Markdown, up to 20,000 characters)
- [x] Instructions box at checkout (kept with the cart, cleared with it) and on the new-run form
- [x] Saved-prompt picker fills the box, cut to 2,000 characters
- [x] Brief `instructions` reaches planner, writer and director as delimited untrusted text
- [x] `pnpm exec turbo run build --filter='!@studio/portal'`: 11 of 11 tasks succeeded
- [x] Browser walkthrough on the installed app (4310, build 5FeN0S0Z8tCygD8hIvRlo) in Chrome on 2026-11-23: Imagens link preview with thumbnail, Prompts form, checkout instructions box with saved-prompt picker and truncation notice, new-run instructions card with the carried-over cart text. Nothing was saved; the test instructions were cleared afterwards and the cart items were kept
- [ ] Final lint, typecheck and tests, including the prompt-version tests (final-checkpoint consent)
- [ ] Security review of the CSP change and the prompt-text read (final gate)

## What was made
<filled on completion>

## Not done
- Images saved by link are not drawn by the renderer; they reach a run only as references.
- Final checks and security review are pending. The 4320 dev server was not walked through (the installed app on 4310 was).

## User checklist
- [ ] Restart the 4320 dev server so the walkthrough can run
- [ ] Approve the final checks and the security review
- [x] Repackage the desktop app (installer of 2026-11-23 18:45, build 5FeN0S0Z8tCygD8hIvRlo)
- [x] Install that build: done with the reinstall script on 2026-11-23; installed BUILD_ID is 5FeN0S0Z8tCygD8hIvRlo

## Verification
- ran: `pnpm exec turbo run build --filter='!@studio/portal'` exit 0 (2026-11-23)
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-23 | owner | none fired | approved | design answers listed under Why; "implement it" chose direct build without a preview
- 2026-11-23 | owner | none fired | deferred | final checks and security review: "Not now"; they stay pending until the owner reopens them
- 2026-11-23 | owner | none fired | deferred | asked again after the 4310 walkthrough: "Not now"

## Changes registered
<filled on completion>

## Notes
- Instructions stay out of `NewRunFormValues`, which the comparison, schedule and curation forms share.
- The owner text is delimited with twice the brief limit so escaping never cuts it.
- Link thumbnails load in the browser; the server never fetches the link (no SSRF surface).
