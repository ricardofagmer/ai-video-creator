---
status: approved
date: 2026-11-23
follows: docs/specs/2026-11-23-catalog-sections-and-link-embed-design.md
---

> As built (2026-11-23): T2 became the client component `SaveReferenceLinkForm.tsx` plus the pure
> builder `reference-link-draft.ts`, because the web app has no server actions and every catalog
> write goes through `browserStudioClient.createAsset` and the BFF proxy; the api still validates
> every field with the shared schemas. The saved notice uses `salvo=<assetId>` (checked against
> `AssetIdSchema`) instead of `salvo=1`, so it can link to the saved item.

# Save a pasted Instagram link as a reference, with a category

## Request
"this frame is too big, make this smaller, and when save ask the category, to organize by this".
Developer answers: save the link only (no download), and reuse the template categories
(hook, title, tool-demo, ai-battle, automation, product-tour, other).

The smaller frame is already done (18rem wide, `min(38rem, 70vh)` tall). This spec covers saving.

## Goal
From References, a pasted Instagram link can be saved as a catalog reference. Saving asks for a
name and a category. References then shows category tabs, the same way Video templates does.
Nothing is downloaded from Instagram, ever.

## Decision

**Chosen: B, store the link as a tiny text item.** Saving creates a normal catalog item of kind
`reference` through the existing upload path (`createAsset`, the same one the New item form uses):

- Content: a small `text/plain` file whose only text is the canonical post URL
  (`https://www.instagram.com/p/<shortcode>/`), built from the parsed shortcode, never the raw input.
  `text/plain` is already allowed for references (`catalog.limits.ts`), so core needs no change.
- Details: `subKind: 'video'`, `referenceNotes` empty.
- Tags: the chosen category id (for example `hook`) plus `instagram`.
- Provenance: source type `url` with the canonical URL; author is the text the developer types
  (optional; defaults to `instagram`); capture date empty.
- Sensitivity `third-party`, status `draft`. Third-party items already need license and
  provenance before they can go active, so the catalog's own rule keeps the post from being
  used in a video by accident.

**Rejected: A, a new `link` storage mode.** The database pins the storage mode to `store` or
`reference` with CHECK constraints (`20261118000000_init`, lines 49 and 54) and an immutability
trigger. A third mode means rebuilding that table and its triggers, plus about 20 places that
read the mode (resolver, preflight, stage files, mapper, view, web details, recipe bindings and
their tests). That is a large, risky migration for something B does with no schema change.
What B gives up: the item has a few bytes of stored content instead of none. That is acceptable.

## What the developer sees

1. Paste a link in References. The compact embed shows, as today.
2. Under the embed, a small **Save as reference** form: Name (prefilled `Instagram <shortcode>`),
   Category (a select with the seven categories, labels from the existing category messages),
   Author (optional), and a Save button.
3. Save creates the item and returns to References on the chosen category tab with a success
   notice. An error shows inline and keeps what was typed.
4. References gets the category tabs (`?categoria=`), with counts and empty ones hidden, the same
   pill tabs Video templates uses. Items with no category tag land in Other.
5. A saved reference whose provenance URL is an Instagram post shows the compact embed on its
   detail page. Cards in the grid stay plain (no iframe per card, so the list stays light).

## Tickets

| Id | Scope | Depends on |
|---|---|---|
| T1 | `template-categories.ts`, `catalog-query.ts` (+ its test expectations), `catalog-tab-items.ts`, `catalogo/page.tsx`: the category filter and tabs also apply in References; counting covers the `reference` kind | none |
| T2 | New server action `features/catalog/save-reference-link.ts`: re-parses the link with `instagram-link.ts`, validates name (1..120), category (one of the seven), author (0..80), builds the text file and calls `createAsset`; redirects to `?secao=referencias&categoria=<id>&salvo=1` | none |
| T3 | `CatalogLinkBox.tsx` + new `SaveReferenceLinkForm.tsx`, `catalog.module.css`, messages pt-BR/en/es (`linkBox.save*`): the form, the inline error and the success notice | T2 |
| T4 | Asset detail page: show `InstagramEmbed` when the item is a reference and its provenance URL parses as an Instagram post | none |

T1, T2 and T4 are independent; T3 follows T2. All are frontend files in `apps/web`; no change
in core, api, shared or the database. The supervisor builds them inline (four small units in one
domain, no dispatch reason).

## Security
- The server action trusts nothing from the form: the link is parsed again with the allowlist
  parser, and only the shortcode reaches the stored URL. Category is checked against the fixed
  list, so a tag can never carry arbitrary text. Lengths are capped.
- The CSP stays as it is (`frame-src https://www.instagram.com` already present).
- No request to Instagram from the server; the browser only loads Instagram's embed page.

## Done when
- Saving a pasted Instagram link creates a draft `reference` item tagged with the chosen category,
  with the canonical URL as provenance and no bytes taken from Instagram.
- References shows category tabs with counts, and the saved item appears under its category.
- An invalid link, a missing name or an unknown category shows an inline error; nothing is saved.
- The saved item's detail page shows the compact embed.
- Checked in the built-in browser (form, tabs, detail page) with no console errors.

## Validation (final gate, with consent)
Web typecheck, lint and `catalog-query.test.ts`; then the security review of this and the
earlier CSP/iframe change. These stay pending until the developer approves them.

## Out of scope
- Downloading, transcoding or caching the post's video or thumbnail.
- Links from sites other than Instagram.
- Video analysis or the beat-by-beat script (later spec).
- Editing a saved reference's category from the card (the existing edit page can change tags).
