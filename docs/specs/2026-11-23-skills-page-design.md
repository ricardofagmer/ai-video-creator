---
status: approved
date: 2026-11-23
---

# Skills page: import, create and edit skills, each with a briefing and a category

## Request
"add a page to import, create edit skills, for each new or existent skill give short briefing about
the sill and add a category to them".
Developer answers: catalog skills (not `~/.claude/skills`), import by uploading a skill folder, a new
category list made for skills, and the briefing lives in the existing `description` field.

## Goal
One page, **Skills**, lists every catalog skill grouped by category, each with a short briefing.
From it you can import a skill folder, write a new skill, and edit a skill's name, briefing and
category. Every skill has exactly one category; an untagged one shows under Other until edited.

## Facts this design rests on
- A skill is a catalog item of kind `skill`, always a folder, with `details.entryFile` (default
  `SKILL.md`) and `details.description` (max 1000 characters) (`packages/shared/src/catalog/kind-details.ts`).
- Catalog versions are immutable: an edit saves version N+1 as a draft. Activation stays on the
  existing detail page.
- `POST /catalog/assets` takes a folder upload (`createAsset`, `{ layout: 'folder', files }`), and
  `POST /catalog/assets/:id/versions/from-previous` (`saveMetadataVersion`) saves N+1 with new
  metadata while reusing the stored bytes.
- Categories already live in tags for templates and references (`template-categories.ts`).

## Decision

**Chosen: a web-only Skills section on the existing catalog API.**
- Category: a closed list stored as one tag, the same way references do it:
  `editing` (Editing), `motion` (Motion & graphics), `audio` (Audio & music), `writing`
  (Writing & scripts), `analysis` (Analysis & review), `publishing` (Publishing), `other` (Other).
  The first tag that names a skill category wins; a skill with none is Other. Saving always writes
  exactly one category tag and keeps every other tag.
- Briefing: the `description` field. The Skills forms cap it at 280 characters (one or two
  sentences); the list shows the first 280 characters of longer, older descriptions with an ellipsis.
- Import: pick a folder. The browser reads `name` and `description` from the entry file's front
  matter (a small parser for `key: value` lines between `---` fences; anything else is ignored),
  prefills the form, and you choose the category before saving. The id is the folder name in kebab
  case, editable.
- Create: a form with id, name, briefing, category and a SKILL.md text area. The browser builds a
  one-file folder (`SKILL.md`, front matter generated from name and briefing, then your text) and
  saves it through the same folder upload.
- Edit: name, briefing and category save through `saveMetadataVersion` (N+1, same bytes). A
  "Replace files" option uploads a new folder as N+1 instead.

**Rejected: a separate briefing column and a category column in the database.** It would mean a
migration plus changes in shared schemas, core, the api, the mapper and their tests, for data the
description field and tags already hold (the developer chose the description field).
**Rejected: managing `~/.claude/skills` on disk.** That gives the server write access to a personal
folder outside the catalog and loses versioning (developer chose catalog skills).

## What the developer sees
1. **Skills** in the drawer under Content, after Catalog (`/skills`).
2. The page header has two buttons, **Import skill** and **New skill**, then category pill tabs with
   counts (empty ones hidden, `?categoria=`), then one card per skill: name, briefing, status badge,
   category, and **Edit** and **Open** links (Open goes to `/catalogo/<id>`).
3. **Import skill** (`/skills/novo?modo=importar`): folder picker, then the prefilled form (id, name,
   briefing, category, owner). Save goes back to `/skills?categoria=<id>&salvo=<assetId>` with a
   success notice; errors show inline and keep what was typed.
4. **New skill** (`/skills/novo?modo=criar`): the same fields plus the SKILL.md text area.
5. **Edit** (`/skills/<assetId>/editar`): name, briefing, category; Save makes N+1 as a draft. A
   "Replace files" folder picker is optional.
6. A skill whose briefing is empty shows "No briefing yet" with a link to Edit.

## Tickets

| Id | Scope | Depends on |
|---|---|---|
| T1 | `features/skills/skill-categories.ts` (list, `skillCategoryOf`, counts, URL parse), `skill-front-matter.ts` (parser), `skill-metadata.ts` (metadata builders: one category tag, 280-char briefing, generated SKILL.md) | none |
| T2 | `app/(studio)/skills/page.tsx` + `features/skills/components/SkillList.tsx`: list, category tabs, cards, notice; drawer link in `navigation-groups.ts`; `messages/skills/{pt-BR,en,es}.ts` and the shell nav label | T1 |
| T3 | `app/(studio)/skills/novo/page.tsx` + `SkillImportForm.tsx` and `SkillCreateForm.tsx`: folder pick, prefill, create, save via `createAsset` | T1, T2 (messages) |
| T4 | `app/(studio)/skills/[assetId]/editar/page.tsx` + `SkillEditForm.tsx`: metadata N+1 via `saveMetadataVersion`, optional folder replace | T1, T2 (messages) |

T1 to T4 are frontend files in `apps/web`. T5 (addendum below) adds one read route and one optional
save field in shared, core and api; no database change. The supervisor builds them inline in order.

## Security
- Front matter and SKILL.md content are untrusted: rendered as plain text only, never as HTML or
  Markdown-to-HTML; the parser reads only `name` and `description` and caps their lengths.
- Category is checked against the closed list, so a tag never carries free text from the URL or form.
- The id goes through `AssetIdSchema`; `?salvo=` and `?categoria=` are parsed the same way.
- Folder uploads use the existing path and size checks (`upload-rules.ts`) and the api's validation.

## Done when
- `/skills` lists every catalog skill under its category tab, each with its briefing.
- Importing a folder with a SKILL.md saves a draft skill with the chosen category and the briefing.
- Creating a skill from the text area saves a draft whose folder holds the generated SKILL.md.
- Editing name, briefing or category saves N+1 with the same bytes and the new single category tag.
- A missing name, an unknown category, a briefing over 280 characters or a bad folder shows an inline
  error and saves nothing.
- Checked in the browser (list, import, create, edit) with no console errors.

## Validation (final gate, with consent)
Web typecheck, lint, and unit tests for `skill-categories.ts`, `skill-front-matter.ts` and
`skill-metadata.ts`. These run only after the developer approves them.

## Addendum 2026-11-23: edit the SKILL.md text (T5)
Request: "i miss the skill text to edit, add this". Developer choice: **API read + save**.

**Contract (frozen before consumers, additive only):**
- `GET /catalog/assets/:assetId/versions/:version/entry-file` returns
  `EntryFileView { path: string, text: string }`: the UTF-8 text of the version's entry file
  (`details.entryFile`, default `SKILL.md`). Skills only, stored or referenced folders.
- `POST /catalog/assets/:assetId/versions/from-previous` accepts an optional
  `entryFile: { text: string }` (at most 256 KiB as UTF-8). When present, N+1 is a new stored folder:
  every file of `fromVersion` is kept by hash, and the entry file is replaced by the new text (or added
  if the folder had none). Without it, the route behaves exactly as before.
- Errors, mapped by category: `EntryFileUnavailableError` (validation, 422) for a non-skill, a file
  layout, a referenced folder on save, a missing entry file on read, a file over 256 KiB or bytes that
  are not UTF-8; not-found errors stay 404. Messages carry no path or content.

**Decision:** a new content source `previous-version-entry-file` in core's save handler, plus a
`GetEntryFileTextQuery`. Rejected: rebuilding the whole folder in the browser (download every file,
re-upload) — more bytes, more failure points, and no read route existed for the other files anyway.

| Id | Scope | Depends on |
|---|---|---|
| T5 | shared `api/catalog.ts` (schema field, `EntryFileViewSchema`); core `catalog.errors.ts`, `asset-content.ts`, `commands/save-asset-version.handler.ts`, new `queries/get-entry-file-text.*`, module and index wiring; api `catalog.controller.ts`; web client, edit page and `SkillEditForm` (SKILL.md text area, disabled while replacement files are picked), messages | T4 |

**Security:** the text is rendered only in a `<textarea>`, never as HTML. Reads open files with
`O_NOFOLLOW`, cap at 256 KiB, verify the sha256 against the manifest and decode with a fatal UTF-8
decoder. The save goes through `ContentStore.putBytes` with the skill folder's head check and the
skill size limit; biometric material stays refused (`assertBiometricStorage`).

**Done when:** the edit page shows the current SKILL.md text; changing it and saving makes N+1 whose
entry file holds the new text and whose other files keep their hashes; a skill whose entry file
cannot be read shows a notice and the field disabled, and the rest of the form still saves.

## Out of scope
- Running or testing a skill from this page.
- Skills on disk in `~/.claude/skills`.
- Bulk import of many folders at once.
