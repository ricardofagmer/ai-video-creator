---
name: 2026-11-24-checkout-video-prompt-content
status: done
completed: 2026-11-24
owner: Ricardo
spec: n/a — follow-up correction to the Fast change 2026-11-24-checkout-video-prompt; small, low-risk, reversible web change
domain: frontend
security_review: not-required
risk: low
new_feature: true
---

## What
The checkout Video prompt now embeds each cart asset's content: the full text of every prompt and skill and the settings of the other assets, not only names and refs.

## Why
The owner reported that the exported `.md` did not contain all the instructions: it must gather the prompts of all assets composed for the video.

## Scope
`apps/web` cart feature only: a browser loader for cart asset versions and entry files, a per-kind detail formatter, the Markdown builder, the checkout component and the three cart message files. No api change; it uses the existing `GET .../versions/:version` and `.../entry-file` routes.

## Checklist
- [x] Load each non-biometric cart item's version, plus the entry file of prompts and skills
- [x] List per-kind settings and notes under each item
- [x] Embed prompt and skill text in a fence longer than any backtick run inside it
- [x] Loading and failed-read states; Copy and Export wait for the content
- [x] Texts in pt-BR, en and es
- [x] Typecheck, lint and browser walkthrough

## What was made
- Added `apps/web/src/features/cart/cart-asset-content.ts`: `loadCartAssetContents` reads `getAssetVersion` for every non-biometric item and `readEntryFile` for prompts and skills; a failed read is reported by name and never blocks the rest.
- Added `apps/web/src/features/cart/cart-asset-details.ts`: `cartAssetDetailLines` turns a version into Markdown bullets per kind (template format and duration, model type and provider, brand kit colors, fonts, captions and tone of voice, music tempo, image size, reference notes, prompt variables, skill description, notes).
- `cart-video-prompt.ts`: each item is now a `###` block with its detail bullets and, for prompts and skills, the full text in a fenced block.
- `CartVideoPrompt.tsx`: loads the content when the set of cart refs changes, shows "Reading the asset content…", lists unreadable items, and keeps Copy and Export disabled while loading.
- `messages/cart/{pt-BR,en,es}.ts`: new help and intro texts, `loading`, `loadFailed` and the `fields` labels.

## Not done
- A skill contributes its entry file only, not the other files of its folder.
- Biometric items are never read; they stay out of the prompt content.
- The real file save of Export was not exercised by the agent.

## User checklist
- [ ] Click Export .md once in the app and confirm the file lands in Downloads
- [ ] Restart the installed web on port 4310 when the dev session ends (`studio-web-live` serves 4310 now)

## Verification
- ran: `pnpm typecheck` exit 0 (2026-11-24)
- ran: `pnpm lint` exit 0 (2026-11-24)
- Manual, Chrome at `http://127.0.0.1:4310/catalogo` on the `studio-web-live` dev server (2026-11-24), cart of 7 items: the prompt is 14,880 characters, holds a block for all 7 assets with their settings, and 3 fenced texts (Prompt do roteirista, Prompt do diretor de cenas, skill fagmer-video-hook); no read failure; Copy enabled after loading.

## Human decisions
No hitl reason fired (risk low). Owner request on 2026-11-24 reversed the earlier "Names and refs" choice: the prompt must gather the content of all assets.

## Changes registered
This session's files for this unit (the working tree also holds unrelated uncommitted work):

- `?? apps/web/src/features/cart/cart-asset-content.ts`
- `?? apps/web/src/features/cart/cart-asset-details.ts`
- `?? apps/web/src/features/cart/cart-video-prompt.ts`
- `?? apps/web/src/features/cart/components/CartVideoPrompt.tsx`
- ` M apps/web/src/messages/cart/en.ts`
- ` M apps/web/src/messages/cart/es.ts`
- ` M apps/web/src/messages/cart/pt-BR.ts`

## Notes
Typecheck and lint were rerun on the changed source under the owner's earlier "Run both" answer for this feature.
