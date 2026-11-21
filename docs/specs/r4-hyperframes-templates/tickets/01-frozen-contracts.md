# 01-frozen-contracts: Frozen contracts: engine discriminator, HyperFrames protocol, RUN-FORMAT (R4H-01)

**What to build:** Every constant, schema and pure rule the runtime, the watcher, the catalog and the CLI agree on exists once, so the other tickets can run in parallel.

**Blocked by:** the owner's answers to OD4 to OD7 (SPEC 0008 section 15); the spec is then frozen

**Status:** blocked (waits for the owner's answers)

## Requirements
- AC 70
- AC 73
- AC 75
- AC 77 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 4.1 to 4.5. Deliver `packages/shared/src/catalog/template-engine.ts` (`TemplateEngineSchema`, `DEFAULT_TEMPLATE_ENGINE`) and use it in `TemplateDetailsSchema.engine` without changing its two values or adding a refinement (K13). Deliver `packages/shared/src/hyperframes/**`, browser-safe: the constants of section 4.2, `flatInputSchemaIssues`, `templateFolderIssues`, `hyperframesTemplateIssues`, `engineState`, `hyperframesPaths`, the three file schemas of section 4.5, and the variable resolution rule of section 5.3 as a pure function. Deliver `hyperframes/files/**` (Node only): read helpers for `engine.json`, `chrome.json`, `trace.json` and atomic writers for the CLI, reusing the existing atomic-write helper. Add the export entry to `packages/shared/package.json`. Write `docs/RUN-FORMAT.md` section 27 and its section 4 writer rows from SPEC 0008 section 4.5. Keep `docs/adr/0008-hyperframes-templates.md` in step with the owner's answers (status stays `proposed`).

## Acceptance criteria
- [ ] `TemplateDetailsSchema` still parses every existing seed and fixture row; `.omit()` on it still works (`packages/core/src/seed/seed-manifest.schema.ts:44`).
- [ ] The pure functions import no Node module; `@studio/shared/hyperframes` is browser-safe; every object schema is `.strict()`.
- [ ] `flatInputSchemaIssues` and `templateFolderIssues` return one named issue per rule of SPEC 0008 section 4.3 (AC 75, 77).
- [ ] `engineState` returns `engine-disabled` for an absent folder and never `ready` for an unreadable or invalid file (AC 70).
- [ ] `DEFAULT_TEMPLATE_ENGINE` is `'remotion'` (AC 73).
- [ ] No helper accepts a path outside `<data home>/hyperframes/`.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof), after the owner's approval. Keep the code testable: pure functions, an injected clock, an injected file root.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no secret literal, no process start, no network call in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0008 or the ticket files.
- [ ] No check, build, test, install, render or git write was run by this ticket; review evidence is by inspection (SPEC 0008 K11, K14).

## EngineOS brief metadata
- Exclusive paths: `packages/shared/src/catalog`, `packages/shared/src/hyperframes`, `packages/shared/package.json` (exports entry only), `docs/RUN-FORMAT.md`, `docs/adr/0008-hyperframes-templates.md`
- dependsOn: none (owner answers OD4 to OD7)
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0008-hyperframes-templates.md`, `docs/vetting/0004-hyperframes-spike.md`, `docs/vetting/0005-hyperframes-dependency.md`
