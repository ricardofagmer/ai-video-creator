---
name: 2026-11-24-catalog-image-categories
status: in-progress
owner: Ricardo Fagmer
domain: frontend
risk: low
spec: docs/specs/2026-11-24-catalog-image-categories.md
security_review: not-required
new_feature: true
release: false
---

# Catalog images by category

## What
Owner request: "under catalog, images must have category and be separated by that to organize our
library, and the user can be capable to register new category during the image process".
Owner answers: category stored as a `cat.<slug>` tag (no API or schema change); starter set People,
Products, Scenes, Icons, Logos plus "No category", user can add more; category sub-tabs like
References and, under "All", one heading per category; no prototype preview.

## What was made
- `features/catalog/image-categories.ts`: image category model (starter set as `cat.<name>` tags,
  `other` for no tag), parse, tag swap, labels, counts and grouping in tab order; cookie
  `studio_image_categories` for this browser's own category names.
- `features/catalog/section-categories.ts`: section-aware category parse and lookup.
- `custom-categories.ts`: cookie writer takes the cookie name.
- `catalog-sections.ts`, `catalog-query.ts`, `catalog-tab-items.ts`: Images get `?categoria=` tabs.
- `app/(studio)/catalogo/page.tsx`: Images filtered by category, grouped by heading under "All",
  tab labels from the image cookie.
- `components/ImageCategoryPicker.tsx`: category select plus "+" to create one inline (selected at once,
  saved to the cookie); same controls and button styles as Save as reference.
- Link path: `ImageLinkBox.tsx` + `image-link-draft.ts` save the category tag and land on its tab.
- Upload path: `asset-form/IdentitySection.tsx` shows the picker for kind image; it rewrites the
  `cat.*` entry of the tags field (`tagsOf` exported from `asset-form-model.ts`).
- Messages (pt-BR, en, es): `tabs.imageCategoriesLabel`, `categories.imageCategories`.

## Checklist
- [x] Spec written and approved by the owner's answers
- [x] Model, tabs and grouping integrated
- [x] Picker on link and upload paths integrated
- [x] Visible check in the app (4320 next dev, signed in through a dev api on 4331)
- [ ] Final checks (owner approval at the final gate)

## Verification (2026-11-24, http://127.0.0.1:4320)
- Images shows the "Image categories" tablist; "All" groups cards under one heading per category.
- Link path: "+" created "Mascots" inline, selected it, status "Category "Mascots" created and selected.",
  focus back on "+"; saving landed on `?categoria=cat.mascots&salvo=linked-image-0l56svn` with tabs
  All 4 / Mascots 1 / No category 3.
- Upload path (`/catalogo/novo?tipo=image`): the picker lists the starter set plus Mascots from the
  cookie; "+" created "Backgrounds" and the tags field showed `cat.backgrounds`; choosing People
  swapped it to `cat.people`. Not saved: an upload needs a real file and would add more library data.
- Left behind: draft image `linked-image-0l56svn` (category Mascots) in the real library.
- Environment: the old production `.next` (BUILD_ID 10:47) moved to `$TMPDIR/next-prod-build-1047`;
  4320 runs `next dev` against a second api on 4331 (origin `http://127.0.0.1:4320`), both started by
  this session.
- Note: the Next dev "N" badge covers the bottom-left card name; it exists only under `next dev`.

## Human decisions
| When | Who | Decision |
|---|---|---|
| 2026-11-24 | Ricardo Fagmer | Tag `cat.<slug>`; starter set; sub-tabs + grouped; no preview |
| 2026-11-24 | Ricardo Fagmer | Restart the 4320 dev server (moves the production `.next` aside) |
| 2026-11-24 | Ricardo Fagmer | Sign in on 4320 through a dev api on 4331; test image stays as a draft |
| 2026-11-24 | Ricardo Fagmer | Final checks (typecheck, lint, catalog tests): "Skip for now" — `[validation] pending — final-stage user approval required` |
