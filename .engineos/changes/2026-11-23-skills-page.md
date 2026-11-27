---
name: 2026-11-23-skills-page
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-11-23-skills-page-design.md
domain: frontend
security_review: pending
preview: declined
risk: medium
new_feature: true
release: false
---

## What
A new Skills section in the web app: `/skills` lists every catalog skill by category, each with a short
briefing; `/skills/novo` imports a skill folder or writes a new skill; `/skills/[assetId]/editar` edits a
skill's name, briefing and category, and optionally replaces its files.

## Why
The user asked for a page to import, create and edit skills, with a short briefing and a category for
every new or existing skill.

## Scope
T1–T4: apps/web only, plus one icon glyph in packages/ui. T5 (spec addendum, SKILL.md text editing) adds
one read route and one optional save field across core, shared, api and web:
- `packages/core/src/catalog/` (skill-entry-file.ts, queries/get-entry-file-text.{query,handler}.ts,
  asset-content.ts, catalog.errors.ts, catalog.limits.ts, catalog.module.ts, index.ts,
  commands/save-asset-version.handler.ts, __tests__/catalog.test.ts constructor update)
- `packages/shared/src/api/catalog.ts`, `packages/shared/src/api/routes.ts`
- `apps/api/src/catalog/catalog.controller.ts`
- `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/api/route-table.ts` (allowlist row), `skills/[assetId]/editar/page.tsx`, `SkillEditForm.tsx`,
  `messages/skills/{pt-BR,en,es}.ts`

T1–T4 files:
- `apps/web/src/features/skills/` (skill-categories, skill-front-matter, skill-metadata, skill-list,
  skill-folder, skills.module.css, components/SkillList, SkillFields, SkillImportForm, SkillCreateForm,
  SkillEditForm)
- `apps/web/src/app/(studio)/skills/page.tsx`, `skills/novo/page.tsx`, `skills/[assetId]/editar/page.tsx`
- `apps/web/src/messages/skills/{pt-BR,en,es}.ts` and `messages/{pt-BR,en,es}.ts` (wiring, nav label)
- `apps/web/src/features/shell/navigation-groups.ts` (Skills nav entry)
- `packages/ui/src/components/icon/Icon.tsx` (`sparkles` icon)

## Checklist
- [x] T1 pure helpers: categories as a `categoria:<id>` tag, SKILL.md front matter, metadata builders
- [x] T2 list page with category tabs, briefing per card, Edit and Open links, nav entry
- [x] T3 import (folder upload, SKILL.md prefill) and create (generated SKILL.md) forms
- [x] T4 edit page: N+1 metadata version, or a new folder version when files are replaced
- [x] Browser check in Chrome on 127.0.0.1:4310
- [x] T5 SKILL.md text editing: `GET .../versions/:version/entry-file` read route, optional `entryFile.text`
  on the from-previous save (keeps the other files by hash), editor on the edit page
- [x] T5 rebuild of shared, core and api, and api restart (with the user's OK)
- [x] T5 browser check in Chrome: text loads, edited text saved as v3 with a new hash, editor reloads it
- [ ] Final checks (typecheck, lint, unit tests): pending the user's approval at the final gate
- [ ] Security review of the new forms and upload path: pending the user's approval

## What was made
- Built `/skills`. It loads up to 100 catalog skills, keeps the newest version of each, and shows them
  under segmented category tabs ("All" plus categories that have skills). Each card shows the category
  badge, status, version and a plain-text briefing (at most 280 characters), or a "No briefing yet" link
  to the edit page.
- Built `/skills/novo?modo=importar`. A folder or SKILL.md is checked with the catalog's upload rules.
  SKILL.md is read in the browser only to prefill the name, briefing and id. The form then uploads the
  folder as a version 1 draft.
- Built `/skills/novo?modo=criar`. Name, briefing, category, id (follows the name until edited) and owner,
  plus an optional body. These become a one-file folder holding a generated SKILL.md.
- Built `/skills/[assetId]/editar`. It starts from the newest version, saves a metadata-only N+1 version,
  or uploads a replacement folder as N+1. A malformed, unknown or non-skill id shows "Skill not found".
- Stored the category as a single `categoria:<id>` tag and the briefing in `details.description`. No
  backend or schema change.
- Added message texts in pt-BR, en and es, a Skills nav item, and a `sparkles` icon.
- T5: added `SkillEntryFileService` in core. It reads a skill's SKILL.md as UTF-8 text: no link following,
  a 256 KiB cap, a sha-256 check against the folder manifest, and a fatal decoder. It also writes N+1 with
  only that file replaced, keeping every other file by hash, for stored folders only. Added the
  `GetEntryFileTextQuery`, the `previous-version-entry-file` content source and `EntryFileUnavailableError`
  (422, reason `entry-file-unavailable`). The api serves `GET /catalog/assets/:id/versions/:v/entry-file`;
  from-previous takes an optional `entryFile.text`. The edit page loads the text into a 16-row editor and sends
  it only when changed. It shows the text read-only for referenced folders, notes that a replacement folder
  wins, and shows a notice when the api refuses the text.
- T5 fix found in the browser check: the web server client only calls api paths listed in the C10 allowlist
  (`apps/web/src/lib/api/route-table.ts`). The new entry-file route was missing, so the edit page could not
  load. Added the row `catalog.entry-file` (GET `catalog/assets/:assetId/versions/:version/entry-file`).

## Not done
- T5 read-only state (referenced folder) and the "text unavailable" notice were not exercised in the browser;
  no such skill was at hand. Loading, editing and saving the text were exercised.
- Final checks (typecheck, lint, unit tests) not run: the user chose to leave them pending.
- Security review not run: pending the user's approval.
- The import form's real save (folder upload) was not exercised; create and edit saves were. Import
  uses the same `createAsset` call with an uploaded folder, and its prefill and validation were checked.
- The test skill `teste-corte-de-pausas` (2 drafts) is still in the catalog; it can be archived later.

## User checklist
- [ ] Approve and run the final checks (typecheck, lint, unit tests) for apps/web and packages/ui
- [ ] Approve or decline the security review of the import/create/edit forms
- [x] Save one real skill (import or create) and one edit, and confirm they appear under the chosen category
- [x] Open `/skills/teste-corte-de-pausas/editar`, change the SKILL.md text, save, and confirm v3 has a new hash
- [ ] Archive or keep the test skill `teste-corte-de-pausas` (draft, v1, v2 and v3)
- [ ] Commit the work (git writes need approval)

## Verification
[validation] pending — final-stage user approval required
- Manual browser check (Chrome, 127.0.0.1:4310, 2026-11-23): the list renders 13 skills. The import page
  prefills id, name and briefing from a sample SKILL.md. Submitting without an owner shows the inline
  error and saves nothing. The create page and the edit page for `fagmer-video-hook` render. An unknown id
  shows "Skill não encontrada". No console errors.
- Real save check (Chrome, 2026-11-23, with the user's approval): the create form saved
  `teste-corte-de-pausas` as a v1 draft in "Edição" and redirected to `/skills?categoria=editing&salvo=…`
  with the "Skill salva como rascunho" alert (14 skills total). One edit (new briefing, category
  "analysis") saved v2 from v1, redirected to the "Análise e revisão" tab, and the card shows "Versão 2"
  and the new briefing. The total stayed 14. `/catalogo/teste-corte-de-pausas` lists v2 (open) and v1
  with the same file hash (metadata-only edit), owner carried over. No console errors.
- ran: `npm run build` in packages/shared, packages/core, apps/api exit 0 (2026-11-23, with the user's OK).
  The first core build failed with TS2339 (`version.assetId`; the field is `id`) in skill-entry-file.ts. It
  was fixed and rebuilt clean.
- Api restarted with `studio stop api` / `studio start api` (pid 25717); `/health` 200. Without a session,
  `GET /catalog/assets/teste-corte-de-pausas/versions/2/entry-file` answers 401 `unauthenticated`, while an
  unknown sibling path answers 404, so the new route is registered.
- T5 browser check (Chrome, 2026-11-23, after the user signed in again): the first load of the edit page went
  to sign-in. Cause: the entry-file route was missing from the web allowlist; the row was added. After that,
  `/skills/teste-corte-de-pausas/editar` shows "Texto do SKILL.md" with the 129-character v2 text, editable.
  A body section was added and saved: redirect to `/skills?categoria=analysis&salvo=…`, card "Versão 3".
  `/catalogo/teste-corte-de-pausas` lists v3 with hash `545dd414…` and 241 B; v2 and v1 keep `148f5fec…`
  and 129 B. The edit page reloads "Baseada na versão 3" with the new 241-character text. No console errors.

## Human decisions
- 2026-11-23 | Ricardo Fagmer | none (no hitl reason fired) | approved | Chose "Catalog skills", "Upload a skill folder", "New skill list" and "Use the description field", then "Approve, build now" for the spec with no throwaway preview.
- 2026-11-23 | Ricardo Fagmer | none | deferred | Final checks, security review and commit left pending ("Leave pending").
- 2026-11-23 | Ricardo Fagmer | none | approved | "Save a real skill": one test skill created and edited once in the catalog.
- 2026-11-23 | Ricardo Fagmer | none | approved | "API read + save (Recommended)" for SKILL.md text editing (T5, spec addendum).
- 2026-11-23 | Ricardo Fagmer | none | approved | "Build, restart, check (Recommended)": rebuilt shared, core, api and restarted the api.
- 2026-11-23 | Ricardo Fagmer | none | deferred | "Skip the browser check" after the restart signed the web app out.
- 2026-11-23 | Ricardo Fagmer | none | approved | "Sign in, check it", then "Signed in, continue": v3 of the test skill saved with an edited SKILL.md.
- 2026-11-23 | Ricardo Fagmer | none | deferred | "Leave pending" for the final checks (typecheck, lint, unit tests) after the T5 browser check.

## Changes registered
The video-studio folder is not a git repository in this session, so there is no `git status`. Files
created: features/skills/* (11 files), the three app routes above, messages/skills/{pt-BR,en,es}.ts.
Files edited: messages/{pt-BR,en,es}.ts, features/shell/navigation-groups.ts,
packages/ui/src/components/icon/Icon.tsx. T5 files are listed under Scope.

## Notes
- T5 widened the scope to core, shared and api by the user's choice; the spec addendum records it.
- Deviation from the spec's "apps/web only": one `sparkles` glyph was added to `packages/ui` Icon for
  the nav entry.
- Existing skill descriptions are longer than the 280-character briefing cap. The edit form shows them as
  they are and asks for a shorter briefing on save, by design.
