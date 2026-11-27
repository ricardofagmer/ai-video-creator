---
name: 2026-11-25-run-references-pictures
status: active
owner: ricardo
spec: n/a — fast change chosen by the developer; extends the existing References box with the catalog upload contract, no new API
domain: frontend
security_review: pending
risk: medium
new_feature: false
release: false
---

## What
The new-run References box lists the catalog's pictures (images and picture-like references) as soon as the page opens, and adds an "Upload image" button plus paste (Cmd+V anywhere on the page). A picked or pasted picture is saved to the catalog as a draft image and added to the run by its `assetId@1` ref.

## Why
The new-run page asked for a picture (`run-without-pictures`) but showed nothing until an empty search was run, and had no way to upload or paste one.

## Scope
- apps/web/src/features/runs/components/RunReferencesPicker.tsx: default picture list, upload button, page paste handler.
- apps/web/src/features/runs/run-image-upload.ts (new): type/size check and create-asset draft for an uploaded picture.
- apps/web/src/messages/runs/{en,pt-BR,es}.ts: new `references` texts.

## Checklist
- [x] Pictures listed by default (kinds image+reference, filtered with shared `isPicture`, biometric excluded)
- [x] Upload button (accept png/jpeg/webp) and paste handler; client type and 50 MiB checks mirror the catalog upload rules
- [x] Messages in 3 locales
- [x] Chrome: picture list renders, no console errors; a pasted 64x48 PNG was saved as `pasted-image-0vzy1zw@1` and added
- [ ] Typecheck web (final gate)
- [ ] Manual check of the Upload image file dialog

## What was made
<filled on completion>

## Not done
- Uploaded pictures carry no license or provenance; sensitivity is `normal` (owner's own upload).

## User checklist
- [ ] Delete the test catalog item `pasted-image-0vzy1zw` if unwanted
- [ ] Approve final typecheck and security review of the new upload path

## Verification
[validation] pending — final-stage user approval required (developer chose "Skip for now" on 2026-11-25: web typecheck not run). Chrome walk on 2026-11-25 as listed in the checklist.

## Human decisions
- 2026-11-25 | ricardo | approach | approved | "Both (Recommended)"
- 2026-11-25 | ricardo | planning | approved | "Fast change (supervisor)"

## Changes registered
<filled on completion>

## Notes
Security: the api stays authoritative for type and size (R1-05 upload rules); the web check only fails early. Paste handling takes only clipboard files whose type starts with `image/`; pasted text is untouched. No preview bytes are rendered.
