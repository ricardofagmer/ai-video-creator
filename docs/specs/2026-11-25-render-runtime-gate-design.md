# Render runtime gate: one module decides whether a HyperFrames render may start

Date: 2026-11-25. Status: design agreed with the owner in a grilling session on 2026-11-25; not
implemented. Owner/decider: Ricardo Fagmer. Risk: medium (changes the pre-start checks of a
sandboxed third-party process; no data, schema or public contract change). This file proposes;
nothing in it runs a check, a build, a test or a git write.

## Problem

The runtime a HyperFrames process needs (`HyperframesRuntime`, about 20 fields) is built and
checked in three places:

- `tools/cli/src/hyperframes/cli-runtime.ts` (`resolveRenderRuntime`), with pre-checks in
  `tools/cli/src/commands/hyperframes-trace.command.ts`;
- `apps/watcher/src/stages/composition/hyperframes-preparation.ts` (`engineRuntime`);
- `apps/watcher/src/stages/process/runner/hyperframes.handlers.ts` (`runtimeOf`), which adds
  `nodePath`, `tmpDir` and `path` in the tool-runner child.

The copies have drifted (read on 2026-11-25):

| Check | Watcher | CLI trace |
|---|---|---|
| ffmpeg and ffprobe outside every folder the sandbox writes (SPEC 0008 section 18.5) | yes | no |
| Studio ports inside 1024 to 65535 | yes | trusts `CliSettings` |
| ffprobe picture probe passes the file-input guard arguments | yes | no |
| Picture frame tolerance | `hyperframesBounds.pictureFrameTolerance / fps` | hard-coded `1 / fps` |
| Check order (section 18.3) | one function | spread over the command |

ADR 0008 decision 4 says the owner-run trace "proves the configuration that later runs". With the
drift above it does not: the trace checks a different runtime than the one the watcher starts.

Smaller symptoms of the same cause: four copies of the "strictly inside a folder" helper,
`parsePictureProbe` copied line for line, the CLI's probe code reached by no test, and the
package's own tests living in `apps/watcher/src/hyperframes-runtime/` because
`@studio/hyperframes` has no test script.

## Decisions

Each was put to the owner as a question and answered on 2026-11-25.

1. **Home.** The module lives in `@studio/hyperframes` (`packages/hyperframes`). It already owns
   the runtime type, the pinned bin, the Chrome verification and the sandbox profile, and ADR 0008
   makes it the only package that names the dependency.
2. **Scope.** The runtime gate and the post-render picture check. Template staging
   (`stageTemplate` and `stageTemplateCopy`) is out of scope.
3. **Drift.** The watcher's stricter rules win everywhere. The trace runs every check the watcher
   runs.
4. **Refusals.** The gate returns the checked runtime or one `HyperframesRefusalReason`. It throws
   only for unexpected failures. The CLI maps the reason to its own error and exit code at its edge.
5. **Seam.** Tests run on a temporary data home with the real file system. Only what a temporary
   folder cannot stand in for sits behind a small system port with a real adapter and a fake: the
   pinned bin, the sandbox profile, `sandbox-exec` presence, the Chrome verification and the
   executable lookup. `HyperframesStagePorts` shrinks to the gate plus `listTemplateFiles`.
6. **Process-local fields.** Two steps in the one module. Step 1 answers the checked runtime
   without `nodePath`, `tmpDir` and `path`. Step 2 completes it with real paths in the process that
   starts HyperFrames. The watcher parent calls step 1 and its tool-runner child calls step 2; the
   CLI calls both.
7. **Trace purpose.** The caller states its purpose, `render` or `trace`. For a trace the gate
   skips only the gate-file state check (`engine-disabled`, `trace-missing`, `trace-stale`) and
   runs every other check in the same order. `assumingEnabled` is deleted.
8. **Refusal texts.** Out of scope. Each caller keeps its own texts for now.
9. **Existing tests.** Replace, do not layer. Check order and each refusal are tested once, at the
   gate's interface, in the package. Watcher stage tests keep only: a refusal reason becomes the
   right stage outcome, and a ready runtime reaches the render request.
10. **Recorded traces.** An existing `trace.json` stays valid. The sandbox profile hash is
    unchanged, so the engine state stays `ready`, and the watcher runs the full gate before every
    render. No forced new trace.
11. **Test home.** `@studio/hyperframes` gets its own test script. The gate's tests live there and
    the seven files of `apps/watcher/src/hyperframes-runtime/` move over.

## Shape

Inputs are a plain record, so the package needs neither `CliSettings` nor `StageSettings` nor
`@studio/core`: data home root, owner home, child `PATH`, ffmpeg and ffprobe as a name or an
absolute path, the two studio ports, the studio root before resolution, and the purpose.

Check order for purpose `render` (unchanged from `engineRuntime` today):

1. Gate files and engine state (skipped for purpose `trace`).
2. `chrome.json` present.
3. `config/`, `cache/` and `home/` as real folders, before the Chrome binary check, so a missing
   `config/` or `home/` answers `runtime-not-prepared` (SPEC 0008 section 18.3). A missing
   `cache/` answers `chrome-missing`: the Chrome binary lives inside `cache/`, so step 1 (purpose
   `render`) or step 2 already finds it absent. Amended 2026-11-26, owner decision.
4. Chrome binary unchanged (section 17.6).
5. Pin, then `sandbox-exec`.
6. Chrome folder and browser real paths; the browser inside `<cache>/chrome`.
7. Every sandbox parameter of section 17.5 as a real path.
8. ffmpeg and ffprobe outside every folder the sandbox writes (section 18.5).
9. Studio ports in range.

The picture check takes the resolved ffprobe path and the expected canvas, fps and duration,
always passes the file-input guard arguments, uses `hyperframesBounds.pictureFrameTolerance`, and
answers check ids. The CLI turns ids into text.

## Rejected alternatives

- **Keep both behaviours behind a mode.** Makes the drift permanent and leaves ADR 0008
  decision 4 untrue.
- **Move the 12-member `HyperframesStagePorts` into the package unchanged.** No watcher test
  rewrites, but a wide port of file-system pass-throughs becomes the package's interface.
- **Throw typed errors from the gate.** Matches the CLI today; forces the watcher to catch and
  translate, and keeps two translation sites.
- **Split the engine-state check into its own function.** Callers would have to know the order
  again.
- **A general template-engine port.** Already rejected as ADR 0008 option D; this design does not
  reopen it. The gate serves one engine.

## Delivery

Three steps, in order, each reviewable on its own:

1. **Package.** The gate, the completion step, the picture check, the system port with its real
   adapter and fake, a test script, and tests on a temporary data home. The seven existing test
   files move from the watcher. Nothing calls the gate yet.
2. **Watcher.** The composition stage and the tool-runner child use the gate. `engineRuntime`,
   its helpers, `runtimeOf` and the watcher's probe copies are deleted, and so are the watcher
   tests that assert check order.
3. **CLI.** The trace and Chrome commands use the gate. `cli-runtime.ts` (runtime parts),
   `picture-probe.ts`, `assumingEnabled` and the command's own pre-checks are deleted.

Between steps 1 and 2 two implementations coexist; behaviour is unchanged until step 2.

## Behaviour changes the owner will see

- `studio hyperframes trace` can refuse where it passes today: ffmpeg or ffprobe inside the data
  home or one of `config/`, `cache/`, `home/` answers `sandbox-unavailable`.
- The trace's picture check tolerates the same frame drift as a render.
- Nothing changes for a render started by the watcher.

## Done when

- One function in `@studio/hyperframes` is the only place that builds a `HyperframesRuntime`.
- The CLI trace and the watcher stage call it, and no copy of the checks remains in either.
- One "inside folder" helper remains for this path.
- The package's tests run under `pnpm test` and cover every refusal and the check order for both
  purposes.
- ADR 0008 decision 4 is true as written.

## Out of scope

Template staging and hashing, refusal texts, the CLI error report, the engine dispatch switch.

## Note, 2026-11-25: step 3 decisions

Two parts of step 3 could not use the gate. `chrome install` runs before `chrome.json` exists, and
`assumingEnabled` answered what `enable` would get, including the trace checks the `trace` purpose
skips. The owner chose to move both into `@studio/hyperframes` instead: `checkInstallRuntime` and
`completeInstallRuntime` (the pin only), and `enableReadiness` (the same file-only answer). Neither
is part of the render runtime gate.
