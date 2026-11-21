# 05-catalog-seed-template: Catalog rules for HyperFrames templates and the seed template (R4H-05)

**What to build:** The catalog refuses a HyperFrames template version that breaks the template rules, and ships one studio-authored, self-contained HyperFrames template the trace can render.

**Blocked by:** 01-frozen-contracts (OD7 answered: which template ships)

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 76
- AC 77 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 4.3, 5.4, OD7 (a), U1, U5, L6. In `packages/core/src/catalog/**`: where `asset-version.factory.ts` validates `details` per kind, add for `kind: 'template'` with `engine: 'hyperframes'` the checks `hyperframesTemplateIssues(details)` and `templateFolderIssues(files)` from `@studio/shared/hyperframes`, refusing the version with the issue list; `remotion` versions take the existing path unchanged. In `packages/core/src/seed/**`: `SeedOriginSchema` gains `'studio'`. In `seeds/templates/hyperframes/title-card/`: `index.html` and `style.css` for "Cartão de título 9:16 (HyperFrames)": 1080x1920, 30 fps, CSS animation only, `data-no-timeline` on the composition root, a system font stack (`-apple-system`, "Helvetica Neue", Arial, sans-serif), no script library, no remote reference, variables `title` (required), `hook`, `disclosure`, `accent` (default `#f97316`), `durationS`, declared in the HTML the way HyperFrames 0.9.72 expects (read the upstream documentation and the bundle first; U1 decides whether the length binds to `durationS` or is a fixed 30 s). Beside it `title-card.input.schema.json`, the flat schema of the same variables. In `seeds/catalog.seed.json`: one new `template` entry (`assetId: "title-card-hf-template"`, `origin: "studio"`, `engine: "hyperframes"`, `compositionId: "TitleCard"`, `aspect: "9:16"`, `duration: { minSec: 3, maxSec: 30 }`, `sceneSchemaFile: null`, empty `cameraMoves` and `transitions`, tags including `hyperframes`), with provenance "created here" and no third-party license.

## Acceptance criteria
- [ ] A `hyperframes` version with a non-null `sceneSchema`, a non-flat `inputSchema` or a folder that fails section 4.3 is refused with its issues; the same `details` as `remotion` are accepted as before (AC 76).
- [ ] The seed template passes `templateFolderIssues` and its schema passes `flatInputSchemaIssues`; it contains no URL with a scheme other than `data:` and no file outside `templateFileExtensions` (AC 77).
- [ ] The six existing `remotion` seed entries are byte-identical; no seed recipe is added or changed (OD7 a).
- [ ] No font, image or library file was downloaded for the template; if a system font cannot be used (U5), the ticket stops and asks, it does not fetch one.
- [ ] No version becomes `active` by any path this ticket adds that did not exist before.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof). The template is not rendered here: its first render is the owner-run trace (AC 85).

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no secret literal, no process start in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `packages/video`, the existing seed templates, the PRD, SPEC 0008 or the ticket files.
- [ ] No check, build, test, install, download, render, seed run, migration or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `packages/core/src/catalog`, `packages/core/src/seed`, `seeds/catalog.seed.json`, `seeds/templates/hyperframes`
- dependsOn: 01-frozen-contracts
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/adr/0008-hyperframes-templates.md`, `docs/vetting/0004-hyperframes-spike.md`
