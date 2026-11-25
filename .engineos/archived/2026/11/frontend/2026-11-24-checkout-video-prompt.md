---
name: 2026-11-24-checkout-video-prompt
status: done
completed: 2026-11-24
owner: Ricardo
spec: n/a — Fast change (supervisor) chosen by the owner on 2026-11-24; small, low-risk, reversible web change
domain: frontend
security_review: not-required
risk: low
new_feature: true
---

## What
Cart checkout gained a "Video prompt" section: the cart items, the site and the instructions as one Markdown prompt the owner copies to the clipboard or exports as a `.md` file.

## Why
The owner wants to take everything gathered during the journey in the app to another tool as a ready prompt for creating the video.

## Scope
`apps/web` cart feature only: prompt builder, checkout section, styles and the three cart message files. No api, no storage, no asset content (the cart holds names, kinds and refs only; the owner chose "Names and refs").

## Checklist
- [x] Pure Markdown builder from cart, destinations, site and instructions
- [x] Checkout section with Copy prompt and Export .md
- [x] Texts in pt-BR, en and es
- [x] Browser walkthrough on the live dev server
- [x] Typecheck and lint

## What was made
- Added `cartVideoPromptMarkdown` in `apps/web/src/features/cart/cart-video-prompt.ts`: heading, intro, one section per checkout destination listing kind, name and ref, then the valid `https:` site and the trimmed instructions when present.
- Added `CartVideoPrompt` in `apps/web/src/features/cart/components/CartVideoPrompt.tsx`: read-only textarea with the prompt, "Copy prompt" (clipboard, with copied/failed status) and "Export .md" (Blob download named per locale).
- `CartCheckoutGroups.tsx` renders it as the last checkout section (tone `prompt`); the destination order moved to `cartDestinationOrder` in `cart-bindings.ts` so the builder and the checkout share it.
- `CartButton.module.css`: `prompt` tone, `.promptText`, `.promptActions`.
- `messages/cart/{pt-BR,en,es}.ts`: new `prompt` block.

## Not done
- The real file save of Export was not exercised: the anchor click was captured in the page to avoid writing to the owner's Downloads folder.
- Asset content is not embedded in the prompt (owner's choice).

## User checklist
- [x] Approve and run `pnpm typecheck` and `pnpm lint` in `apps/web`
- [ ] Click Export .md once in the app and confirm the file lands in Downloads
- [ ] Restart the installed web on port 4310 when the dev session ends (PID 8115 was stopped on request; `studio-web-live` now serves 4310)

## Verification
- ran: `pnpm typecheck` exit 0 (2026-11-24)
- ran: `pnpm lint` exit 0 (2026-11-24)
- Manual, Chrome at `http://127.0.0.1:4310/catalogo` on the `studio-web-live` dev server (2026-11-24), cart of 7 items:
  - checkout shows the "Video prompt" section; the textarea lists the 6 preset bindings, 1 scriptwriter skill and the instructions
  - "Copy prompt" shows the status "Prompt copied."
  - "Export .md" creates a download named `video-prompt.md` whose Blob text equals the textarea
  - console errors seen came only from the test stub over `HTMLAnchorElement.prototype.click`, not from app code

## Human decisions
No hitl reason fired (risk low). Owner answers on 2026-11-24: "Fast change (supervisor)"; prompt body "Names and refs"; final checks "Skip for now", then "Run both"; "Yes, stop PID 8115".

## Changes registered
This session's files (the working tree also holds unrelated uncommitted work, 124 files in `git diff --stat HEAD`):

- `?? apps/web/src/features/cart/cart-video-prompt.ts`
- `?? apps/web/src/features/cart/components/CartVideoPrompt.tsx`
- `M apps/web/src/features/cart/cart-bindings.ts`
- `M apps/web/src/features/cart/components/CartButton.module.css`
- `M apps/web/src/features/cart/components/CartCheckoutGroups.tsx`
- `M apps/web/src/messages/cart/en.ts`
- `M apps/web/src/messages/cart/es.ts`
- `M apps/web/src/messages/cart/pt-BR.ts`

## Notes
The Stop gate was deferred during the session with the marker the gate names, until the checks ran.
