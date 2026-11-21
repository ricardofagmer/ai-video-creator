# 04-watcher-engine-dispatch: Watcher: engine dispatch and the HyperFrames render (R4H-04)

**What to build:** A run whose recipe binds a HyperFrames template renders it at the composition stage when the engine is ready, and stops with a clear reason when it is not; a run with a Remotion template behaves exactly as before.

**Blocked by:** 01-frozen-contracts, 03-hyperframes-runtime

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 70
- AC 71
- AC 72
- AC 74
- AC 78
- AC 79
- AC 80
- AC 81 (SPEC 0008 section 8; PRD 0001 R4 goal 5 through SPEC 0008 section 11)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md sections 4.4, 5.1, 5.2, 5.3, 5.7 and U7. First, before any edit, capture the request the current code sends for the Remotion fixture (by reading `renderPlan` and `composition.executor.ts`) and hand it to the supervisor as the golden for AC 71. Then: in `tool-runner.protocol.ts` add `HyperframesRenderRequestSchema` to the union and leave every other member untouched; add `runner/hyperframes.handlers.ts` (write `variables.json`, `renderPicture` with the real adapter, ffprobe check, ffmpeg mux and cut, using the toolbox helpers the media handlers already use) and its case in `tool-runner.main.ts`; in `composition.executor.ts` switch on `template.details.engine`, keeping the Remotion body unchanged and consulting `templateIdOf` only for `remotion`; add the HyperFrames branch with the eight pre-start checks of section 5.2 in order; add the refusal texts of section 5.7 to `stage-texts.ts`. To read a `layout: 'folder'` template's files, use the catalog store reader that already exists in `packages/core` (U7): read it first; if the watcher has no way to read a folder asset, return `BLOCKED` naming what is missing instead of writing a second reader.

## Acceptance criteria
- [ ] `RenderRequestSchema`, `render()`, `renderPlan`, `templateIdOf`, `rendersOnCanvas` and `renderSlate` have no diff (AC 72).
- [ ] The Remotion fixture's request equals the golden; a `hyperframes` template never produces a `render` command and a `remotion` template never produces `hyperframes-render` (AC 71).
- [ ] Each refusal of section 5.2 stops the stage as `needs-person` with its section 5.7 text and starts no child (AC 70, 78, 80).
- [ ] Mock mode renders the slate for either engine and reads no file under `<data home>/hyperframes/` (AC 74).
- [ ] The handler adopts no output when the picture check fails, cuts a longer picture to the narration, and returns the existing `RenderResultSchema` shape (AC 79).
- [ ] The template is rendered from a copy in the scratch directory, each file checked against the folder manifest; no biometric asset path reaches the request.
- [ ] The watcher writes nothing under `<data home>/hyperframes/` and never imports `ensureBrowser`.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 07-final-proof). Keep the code testable: the handler takes the process port and the probe as parameters; the executor takes the gate reader and the clock from its dependencies.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `npx`, no `shell: true`, no secret literal in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to `apps/watcher/package.json`, `packages/video`, the PRD, SPEC 0008 or the ticket files.
- [ ] Activity text, logs and runner replies carry ids, reason ids and durations only: no variable value, path or child stderr (SPEC 0008 K12, AC 81).
- [ ] No check, build, test, install, render or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `apps/watcher` except `apps/watcher/package.json`
- dependsOn: 01-frozen-contracts, 03-hyperframes-runtime
- Owner: backend-coordinator
- Risk / autonomy: medium / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0008-hyperframes-templates.md`
