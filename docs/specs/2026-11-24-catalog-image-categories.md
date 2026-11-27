---
status: approved
date: 2026-11-24
follows: docs/specs/2026-11-23-reference-link-save-and-categories-design.md
---

# Image categories in the catalog

## Request
"under catalog, images must have category and be separated by that to organize our library, and the
user can be capable to register new category during the image process".

Developer answers (2026-11-24):
- Storage: a tag `cat.<slug>`, the way References keeps user-created categories. No api or schema change.
- Built-ins: a starter set (People, Products, Scenes, Icons, Logos) plus "No category"; the user adds more.
- Layout: category sub-tabs, like References, and under "All" one heading per category.
- Prototype preview: declined.

## Goal
Every image in the catalog sits in one category. The Images section shows the categories as sub-tabs,
and "All" groups the library under one heading per category. While saving an image, by link or by file
upload, the user picks a category or creates a new one on the spot.

## Decision

**Chosen: every image category is a `cat.<slug>` tag, built-ins included.** The built-ins are
`cat.people`, `cat.products`, `cat.scenes`, `cat.icons`, `cat.logos`; their names come from the
translations. An image with no `cat.*` tag is "No category" (internal id `other`, the same id Video
templates and References use for their catch-all). The first `cat.*` tag of an image wins.

Rejected: bare tags for the built-ins (`people`, `logos`), as Video templates do (`hook`). Images
already carry free tags such as `link`, and a bare word could put an old image in a category nobody
picked. A single prefix keeps the category unambiguous.

Rejected: a new `category` field in `ImageDetails`. It needs a shared schema change, an api change and
a migration of existing rows; the tag needs none.

- User-created image categories keep their display name in their own cookie,
  `studio_image_categories`, separate from the References list (`studio_reference_categories`), so
  each section's tabs show only its own categories.
- `details.purpose` (logo, still, background, cover, other) stays as it is. It no longer drives the
  headings of the Images section; categories do.
- `?categoria=` filters Images too. URL values outside `other` and the `cat.<slug>` shape are dropped.

## Scope
In:
- `features/catalog/image-categories.ts`: built-ins, parse, category of a version, label, counts,
  the cookie name, and the tag rewrite for the upload form.
- Category tabs and grouped headings in the Images section (`catalogo/page.tsx`,
  `catalog-tab-items.ts`, `catalog-query.ts`, `catalog-sections.ts`).
- `ImageCategoryPicker` client component: select, "+" button, inline new-category row (the same
  controls and styles as Save as reference).
- The picker in `ImageLinkBox` (link save) and in the New item form when the kind is image (upload).
- Messages in pt-BR, en and es.

Out: References and Video templates behavior; the redesign of other pages; any api, core or shared
schema change; moving existing images into categories (they show under "No category").

## Done when
- An image saved by link carries its category tag; "No category" adds none.
- An image uploaded through the New item form carries its category tag.
- The Images section shows sub-tabs All, each used category, No category; and under All one heading
  per category.
- A category created inline is selected at once, and after saving it shows as a tab with its typed name.
- Verified visibly in the running app on the 4320 dev server.
