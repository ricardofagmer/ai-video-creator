---
name: 2026-11-23-reference-categories-and-video-embeds
status: active
owner: Claude (side session of the catalog work)
spec: docs/specs/2026-11-23-reference-link-save-and-categories-design.md
domain: frontend
security_review: not-required
risk: low
new_feature: true
release: false
---

## What
A "+" button beside the Categoria select on "Salvar como referência" creates a category, selects it and
keeps it; the link box now embeds Instagram, YouTube (video and Shorts) and TikTok at the right aspect
ratio with no clipping or inner scrollbars.

## Why
The developer asked: "add button to register new categories, also adjust the view of the instagram or
youtube or tiktoke video, is broken", then "put the button add categoria at the same line of dropdown
category just a + button" and "we must be able to play instagram video there not redirect to insta".

## Scope
apps/web/src/features/catalog (video-link.ts, custom-categories.ts, reference-link-draft.ts,
template-categories.ts, catalog-tab-items.ts, catalog.module.css, components/VideoEmbed.tsx,
components/CatalogLinkBox.tsx, components/SaveReferenceLinkForm.tsx), app/(studio)/catalogo/page.tsx,
app/(studio)/catalogo/[assetId]/page.tsx, middleware.ts (CSP frame-src), messages/catalog/{pt-BR,en,es}.ts.
Removed: features/catalog/instagram-link.ts, components/InstagramEmbed.tsx.

## Checklist
- [x] Category storage chosen by the developer: tag `cat.<slug>` plus the browser list cookie
- [x] "+" button on the Categoria line, secondary button styling, opens name field (Enter adds, Escape cancels)
- [x] New category selected, announced in the status line, persisted in cookie `studio_reference_categories`
- [x] Server reads the cookie so tabs and the form show the typed label
- [x] One `VideoEmbed` for Instagram, YouTube (16:9 and Shorts 9:16) and TikTok (9:16); CSP frame-src lists the three hosts
- [x] Instagram frame height follows the embed's MEASURE message
- [x] Visual verification in Chrome for each platform and the category flow
- [ ] ~~Instagram inline playback for every reel~~ — Instagram's embed opens instagram.com for some reels (licensed music); developer chose to keep the official embed rather than scrape the mp4

## What was made
- Added `video-link.ts` (parses Instagram /p, /reel, /tv; YouTube watch, youtu.be, /shorts, /embed, /live; TikTok /@user/video/<id>) and `VideoEmbed.tsx` with per-platform frames and aspect classes, replacing `instagram-link.ts` and `InstagramEmbed.tsx`.
- Added `custom-categories.ts` (slug ids `cat.<slug>`, cookie encode/decode, label map) and wired it into `catalogo/page.tsx`, `catalog-tab-items.ts`, `template-categories.ts` and `reference-link-draft.ts`.
- Added the square "+" button beside the Categoria select in `SaveReferenceLinkForm.tsx`, with the name field, Adicionar and Cancelar below it, focus return and a status line.
- Fixed a duplicate React key between the embed and the form; updated the en help text to name all three platforms.
- Verified in Chrome on 2026-11-23: Instagram card 400x708 with no clipping; YouTube 16:9 plays inline; YouTube Short 9:16; TikTok 320x569 (9:16) plays inline with controls; "Tutorial rápido" created, selected and still listed after reload.

## Not done
- Typecheck and lint not run: the developer chose "Skip for now" at the final checkpoint.
- Instagram reels that Instagram itself will not play inline still open instagram.com (developer decision: keep official embed).
- Nothing committed.

## User checklist
- [ ] Run `pnpm --filter @studio/web typecheck` and `pnpm --filter @studio/web lint` (skipped at the final checkpoint)
- [ ] Approve a commit of these files
- [x] Decide Instagram behaviour (kept official embed)

## Verification
- manual: Chrome on http://127.0.0.1:4310/catalogo?secao=referencias with Instagram, YouTube, YouTube Shorts and TikTok links, plus the "+" category flow and reload (2026-11-23)
- [validation] pending — final-stage user approval required (developer answered "Skip for now" for typecheck and lint)

## Human decisions
- 2026-11-23 | developer | none (no hitl reason fired; risk low) | approved | Storage: "Tag + browser list (Recommended)"
- 2026-11-23 | developer | none | approved | Platforms: "Add full support (Recommended)"
- 2026-11-23 | developer | none | approved | Instagram: "Keep official embed (Recommended)"
- 2026-11-23 | developer | none | refused | Final checks: "Skip for now"

## Changes registered
Scoped `git status --short` (the working tree also holds other sessions' uncommitted work, not part of this record):
```
 M apps/web/src/app/(studio)/catalogo/[assetId]/page.tsx
 M apps/web/src/app/(studio)/catalogo/page.tsx
 M apps/web/src/middleware.ts
?? apps/web/src/features/catalog/catalog-tab-items.ts
?? apps/web/src/features/catalog/catalog.module.css
?? apps/web/src/features/catalog/components/CatalogLinkBox.tsx
?? apps/web/src/features/catalog/components/SaveReferenceLinkForm.tsx
?? apps/web/src/features/catalog/components/VideoEmbed.tsx
?? apps/web/src/features/catalog/custom-categories.ts
?? apps/web/src/features/catalog/reference-link-draft.ts
?? apps/web/src/features/catalog/template-categories.ts
?? apps/web/src/features/catalog/video-link.ts
?? apps/web/src/messages/catalog/
```
Deleted (never tracked): apps/web/src/features/catalog/instagram-link.ts, apps/web/src/features/catalog/components/InstagramEmbed.tsx.
The catalog files under `??` are untracked as a whole and also carry the parent record
2026-11-23-catalog-sections-and-link-embed's work.

## Notes
- The in-app Browser pane does not paint cross-origin iframes; verify embeds in Chrome.
- Archive blocked until a `- ran:` line exists in Verification; the session's Stop gate was deferred with the hook's marker.
