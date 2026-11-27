---
id: 2026-11-23-catalog-sections-and-link-embed
status: open
domain: frontend
risk: medium
autonomy: A2
security_review: pending
spec: docs/specs/2026-11-23-catalog-sections-and-link-embed-design.md
---

# Catalog: four sections and the reference link embed

## Request
"not only template, all the item, it is poorly organized ... reoganize this to not confunse the user"
and "the user will send a link https://www.instagram.com/p/DfDrN7Xgi3G/ ... save as reference", plus
"also leave this video displaying in this page to check the outcome (do not download just a embbed)".

## Human decisions
- 2026-11-23, developer: References section first (References first).
- 2026-11-23, developer: link plus upload fallback, never a downloader (Link + upload fallback).
- 2026-11-23, developer: beat-by-beat breakdown for the later analysis spec.
- 2026-11-23, developer: catalog only for now; analysis, script and save are a later spec.
- 2026-11-23, developer: spec approved, build now, no throwaway preview.
- 2026-11-23, developer: final checks and CSP security review left pending ("Leave pending").
- 2026-11-23, developer: save the link only, reuse the template categories; spec
  `2026-11-23-reference-link-save-and-categories-design.md` approved ("Approve, build now
  (Recommended)"), no throwaway preview.
- 2026-11-23, developer: restart of the 4310 web dev server approved ("Restart it for me
  (Recommended)"); then the browser re-check was skipped ("Skip the browser check").
- 2026-11-23, developer: after the verified save re-check, final checks, security review and commit
  left pending again ("Leave pending").
- HITL reasons: none fired (risk medium, no external effect; the embed only loads Instagram's page).

## What was made
- `features/catalog/catalog-sections.ts` (new): four sections, References / Video templates /
  AI & writing / Media & brand, with their kinds, URL slugs (`?secao=`) and tab ids.
- `features/catalog/instagram-link.ts` (new): allowlist parser for Instagram `p`/`reel`/`tv` links
  (500-character cap); only the parsed shortcode builds the embed URL.
- `features/catalog/catalog-tab-items.ts` (new): section, kind and template-category tab builders,
  moved out of the page to keep it under 300 lines.
- `CatalogLinkBox.tsx` and `InstagramEmbed.tsx` (new): a GET form on `?link=` in References; a
  supported link shows Instagram's embed in a sandboxed, lazy iframe; others show a warning.
- `catalog-query.ts`: `section` filter; `?tipo=` implies its section, so old links still work;
  `catalogSectionTabHref`; the category filter lives only in Video templates.
- `catalogo/page.tsx`: section tabs with counts, kind sub-tabs only for multi-kind sections with
  empty kinds hidden, link box in References; counts come from one parallel count query.
- `middleware.ts`: CSP adds `frame-src https://www.instagram.com` (nothing else).
- `SemanticSearchPanel`, `CatalogModeSwitch`, `CatalogFilterBar`, `CatalogGroupedGrid`: carry the
  section, search all kinds of a section, and drop the dead per-group tabs prop.
- Messages pt-BR/en/es: `sections` and `linkBox` blocks.
- Follow-up (developer: "align this"): tabs lost their side padding (gap 24px instead), so both tab
  rows line up with the content edge; checked in the browser, all at the same left offset.
- Follow-up (developer: "use like the button by words not as the same style of tabs"):
  `CatalogKindTabs` gains `appearance: 'underline' | 'pill'`; the kind sub-tabs and the template
  category tabs use `pill` (the same `buttonClassName` primary/secondary sm as By words / By meaning),
  the four section tabs keep the underline. Checked in the browser, no console errors.
- Follow-up (developer: "align the buttons"): `.pillList` gap 8px -> 12px (`--space-3`), the same as
  the By words / By meaning row; browser check: both rows start at 24px, 12px between buttons.
- Follow-up (developer: "must have differnt colors ... put below the input to not confund with items
  above"): `CatalogModeSwitch` is now a segmented control in the info (blue) tokens (`.modeSwitch`,
  `.modeOption`, `.modeOptionSelected`), no longer the brand buttons. By words renders it right after
  the filter bar; `SemanticSearchPanel` takes a `modeSwitch` prop and renders it under the query form,
  or under the "unavailable" notice. Browser check of both modes, no console errors.
- Follow-up (developer: "Como a nota é calculada ... still to large"): new `features/quality/quality.module.css`;
  the explanation is a small muted xs summary, and its body is xs text in a bordered box capped at
  12rem with its own scroll (max 72ch wide). Browser check: 18px closed, 218px open, 12px text.
- Follow-up (developer: "improve this nav for light them to not be so white"), then rolled back
  (developer: "nah rollback as it was"): the `--color-surface-bar` token was added and then removed
  again; `.topbarInner` is back on `--color-surface-glass`. Browser check after the rollback: the bar
  reads `rgba(239, 239, 242, 0.8)` in light again, the token is gone, no console errors. Net change in
  `packages/ui`: none.
- Follow-up (developer: "this frame is too big, make this smaller"): `.embedFrame` max width
  26rem -> 18rem and `.embed` height `min(52rem, 85vh)` -> `min(38rem, 70vh)`; browser check: frame
  288x538 px, video and likes visible, no console errors.
- Follow-up (developer: "when save ask the category, to organize by this"): design at
  `docs/specs/2026-11-23-reference-link-save-and-categories-design.md`, approved and built:
  - `instagram-link.ts`: `instagramPostUrl(post)` rebuilds the canonical post URL from the parsed shortcode.
  - `reference-link-draft.ts` (new): `referenceAssetIdOf` (`ig-<shortcode>`) and `referenceLinkDraftOf`,
    a `reference` item (sub-kind video, sensitivity third-party, provenance `{type:'url'}`, tags
    `[category, 'instagram']`) whose content is a tiny text file holding only the link.
  - `SaveReferenceLinkForm.tsx` (new): name, category (the seven template categories), owner,
    optional author; inline errors; `createAsset`; redirect to References on the chosen category tab
    with `salvo=<assetId>`; API errors shown with `describeApiError`, typed values kept.
  - `CatalogLinkBox.tsx`: embed and form side by side (`.linkPreview`, `.saveForm`), success alert
    with a link to the saved item; `catalogo/page.tsx` reads `salvo` through `AssetIdSchema`.
  - References now shows the category tabs ("Reference categories").
  - `catalogo/[assetId]/page.tsx`: a saved reference whose provenance URL passes the allowlist
    parser shows a "Reference video" card with the same sandboxed embed.
  - Messages pt-BR/en/es: `linkBox.save`, `tabs.referenceCategoriesLabel`, `asset.referenceVideoTitle`.
  - Deviation from the spec: client component instead of a server action (the app has none), and
    `salvo=<assetId>` instead of `salvo=1`; recorded in the spec's "As built" note.
- Follow-up (developer: "still to white, when light theme colorfull this"; chose "Soft brand gradient
  (Recommended)" and "Fast change (supervisor)"): new token `--gradient-bar` in `packages/ui` `tokens.css`
  (orange -> pink -> purple at 16% alpha, stops transparent in dark) layered on `.topbarInner` in
  `AppShell.module.css` over the existing glass. Chrome check: light bar reads peach/pink/lilac with
  dark ink text; dark theme computes to transparent stops (unchanged); no console errors.
- `catalog-query.test.ts`: expectations updated to the section rules (not run).

## Checklist
- [x] Four section tabs with counts on `/catalogo` (built-in browser: 0 / 7 / 20 / 5)
- [x] AI & writing shows kind sub-tabs All / AI models / Prompts / Skills
- [x] `?tipo=template` lands on Video templates with the category tabs
- [x] Instagram link shows the embed and plays in Chrome; served CSP carries the `frame-src`
- [x] Non-Instagram link shows the "only Instagram" warning
- [x] Save form renders beside the embed (name, 7 categories, owner, author); empty owner shows
      "Enter the owner." inline; Save sends `POST /api/studio/catalog/assets`
- [x] Successful save (Chrome, signed in, category Hooks, owner studio): success alert "Referência
      salva como rascunho. Abrir a referência", redirect to `/catalogo?categoria=hook&salvo=ig-dfdrn7xgi3g`
- [x] References tab shows count 1 and category pills Todos 1 / Chamadas 1; the item
      `ig-dfdrn7xgi3g@1` (draft, third-party, tags hook + instagram) is listed under Chamadas
- [x] Detail page `/catalogo/ig-dfdrn7xgi3g`: text/plain, 41 B, provenance
      `https://www.instagram.com/p/DfDrN7Xgi3G/`; "Vídeo de referência" card shows the sandboxed
      embed (288x608, `allow-scripts allow-same-origin allow-popups`) with the video; no console errors
- [ ] `[validation] pending — final-stage user approval required` (typecheck, lint, unit tests)
- [ ] Security review of the CSP and iframe change (pending, final gate)

## Not done
- Typecheck, lint and `catalog-query.test.ts`: not run, waiting for final-stage approval.
- The built-in app pane shows the embed frame blank (it blocks third-party frames); Chrome shows it.
- Analysis, beat-by-beat script and upload fallback: later spec by decision.
- Save incident (resolved): the first browser save returned a Next.js 500 that never reached the
  api (no item was created). Cause: a second `next dev` I started on 4320 shared `apps/web/.next`
  with the 4310 dev server and removed its compiled `api/studio/[...path]/route.js`. The 4310 server
  was restarted; after the developer signed in again, the save, category tab and detail embed were
  verified (see Checklist).
- The verification created one real catalog item, `ig-dfdrn7xgi3g@1` (draft). Keep it or delete it
  from the catalog as you prefer.
- The 4310 dev server now runs from the preview config `studio-web-dev-4310-signin-check`, not the
  developer's terminal.

## User checklist
- [ ] Approve the final checks (web typecheck, lint, unit tests)
- [ ] Approve the security review of the CSP `frame-src` and sandboxed iframe
- [ ] Commit when satisfied (nothing committed)
- [x] Sign in at 127.0.0.1:4310 so the save can be checked (done; verified in Chrome)
- [ ] Start the follow-up spec: analyse the linked video, write the beat-by-beat script

## Verification
- Browser, 2026-11-23: built-in pane on 127.0.0.1:4310 and Chrome; see Checklist.
- Browser, 2026-11-23 (after sign-in): save flow end to end in Chrome, category tab, detail embed,
  console clean on both pages.
- `[validation] pending — final-stage user approval required`

## Changes registered
New: `catalog-sections.ts`, `instagram-link.ts`, `catalog-tab-items.ts`, `reference-link-draft.ts`,
`components/CatalogLinkBox.tsx`, `components/InstagramEmbed.tsx`, `components/SaveReferenceLinkForm.tsx`,
plus `docs/specs/2026-11-23-reference-link-save-and-categories-design.md`.
Also edited for the save follow-up: `app/(studio)/catalogo/[assetId]/page.tsx`,
`template-categories.ts`, `catalog-sections.ts`, `catalog-tab-items.ts`.
Edited: `catalog-query.ts`, `catalog-query.test.ts`, `catalog.module.css`, `middleware.ts`,
`CatalogGroupedGrid.tsx`, `SemanticSearchPanel.tsx`, `CatalogModeSwitch.tsx`, `CatalogFilterBar.tsx`,
`messages/catalog/{pt-BR,en,es}.ts`, `app/(studio)/catalogo/page.tsx`, `CatalogKindTabs.tsx`
(all under `apps/web/src/`), plus new `features/quality/quality.module.css` and edited
`features/quality/components/QualityFormulaExplanation.tsx`. `packages/ui`: the first nav attempt was
rolled back; the later light-theme tint edits `packages/ui/src/styles/tokens.css` and
`packages/ui/src/components/layout/AppShell.module.css`.
The working tree carries other uncommitted work, so `git diff --stat HEAD` is not this change alone.
