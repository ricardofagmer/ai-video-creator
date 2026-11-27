# Render runtime gate (steps 1 to 3)

Date: 2026-11-25. Spec: `docs/specs/2026-11-25-render-runtime-gate-design.md`. Risk: medium.
State: steps 1, 2 and 3 written, not verified. Typechecks and tests pending.
security_review: pending

## What was made

- `packages/hyperframes/src/render-runtime-gate.ts`: `checkRenderRuntime` (purpose `render` or
  `trace`) and `completeRenderRuntime`. Ported from the watcher's `engineRuntime`; the watcher's
  stricter checks apply to both purposes.
- `packages/hyperframes/src/render-runtime-system.ts`: the small system port, its real adapter and
  `fakeRenderRuntimeSystem`.
- `packages/hyperframes/src/picture-check.ts`: `checkPicture`, with the file-input guard arguments
  and `hyperframesBounds.pictureFrameTolerance`.
- `packages/hyperframes/src/inside-folder.ts`: the one inside-folder helper; `chrome-binary.ts`
  and `pinned-bin.ts` now use it.
- `packages/hyperframes/src/index.ts`: exports for the above.
- `CONTEXT.md` (new), a dated note on ADR 0008 decision 4, and the spec.

Step 2 (watcher), written and not verified:

- `apps/watcher/src/stages/composition/hyperframes-stage.ports.ts`: `HyperframesStagePorts` is now
  `renderRuntime(settings)` (the gate, purpose `render`) plus `listTemplateFiles`. The ten
  pass-through members and `RealFolder` are gone.
- `apps/watcher/src/stages/composition/hyperframes-preparation.ts`: `engineRuntime` and its helpers
  deleted; the template and variable checks stay.
- `apps/watcher/src/stages/executors/composition.executor.ts`: check 1 calls `hyperframes.renderRuntime`.
- `apps/watcher/src/stages/process/runner/hyperframes.handlers.ts`: the child completes the runtime
  with `completeRenderRuntime` and checks the picture with `checkPicture`; the local probe parser,
  mismatch list and ffprobe arguments are deleted. `PictureCheckError` stays.

The watcher render path now goes through the gate.

Step 3 (CLI), written and not verified:

- `tools/cli/src/commands/hyperframes-trace.command.ts`: asks the gate (purpose `trace`) before the
  notice and the typed confirmation, then completes the runtime in its scratch folder. Its own
  pre-checks, `withChromeRefusal` and the `verifyChromeBinary` call are deleted.
- `tools/cli/src/hyperframes/cli-runtime.ts`: `resolveRenderRuntime` and its helpers deleted;
  `renderRuntimeRequest` and `startingProcess` added. `baseRuntime`, `withScratchFolder` and
  `HYPERFRAMES_CLI_ACTOR` stay.
- `tools/cli/src/hyperframes/hyperframes.errors.ts`: `renderRuntimeRefusalError` maps a gate refusal
  to the CLI error; `pin-mismatch` reads the pin again for its detail text.
- `tools/cli/src/hyperframes/network-trace.ts`: checks the picture with `checkPicture`.
  `picture-findings.ts` (new) words the mismatch ids in the active language.
- `tools/cli/src/hyperframes/hyperframes-ports.ts`, `real-ports.ts`: `probePicture` replaced by
  `readProbe(program, args, searchPath)`; `PictureProbe` and `PictureProbeRead` deleted.
- `tools/cli/src/hyperframes/picture-probe.ts`: deleted.

- `packages/hyperframes/src/install-runtime.ts` (new): `checkInstallRuntime` (the pin, before the
  owner is asked) and `completeInstallRuntime`. `hyperframes chrome install` uses them;
  `baseRuntime` is deleted from `cli-runtime.ts`.
- `packages/hyperframes/src/enable-readiness.ts` (new): `enableReadiness(files, current)`, the
  file-only answer of what `enable` would get. `assumingEnabled` is deleted from
  `hyperframes-status.ts`, and the unused `now` option of `readHyperframesStatus` with it (callers
  in `hyperframes.command.ts` and `doctor.command.ts`).

Behaviour changes of the trace: Chrome is hashed before the confirmation; ffmpeg or ffprobe inside
a writable folder and ports outside 1024 to 65535 are refused; the picture duration uses
`hyperframesBounds.pictureFrameTolerance` instead of one frame.

## Checklist

- [x] Gate, completion step, system port, picture check written
- [x] Package exports added
- [ ] Typecheck of `@studio/hyperframes` (not run)
- [ ] Tests for the gate and the picture check, test script in the package (not written)
- [x] Step 2: watcher stage and tool-runner child use the gate; old builder and probe copies removed
- [ ] Step 2 tests: `composition-stage.harness.test.ts` (imports `RealFolder`, implements the old
  12-member port) and `hyperframes.handlers.test.ts` (imports `parsePictureProbe`,
  `pictureMismatches`, `PictureProbe`, fakes `probePicture`) no longer compile; update or replace
- [ ] Typecheck of `@studio/watcher` (not run)
- [x] Step 3: CLI trace uses the gate; `cli-runtime.ts` runtime parts and `picture-probe.ts` removed
- [ ] Step 3 tests: `hyperframes-cli.harness.test.ts` (imports `PictureProbe`, `PictureProbeRead`,
  fakes `probePicture`) no longer compiles; fake `readProbe` instead
- [ ] Typecheck of the CLI (not run)
- [ ] Move the 7 test files from `apps/watcher/src/hyperframes-runtime/`

## Known gaps

- `picture-check.ts` holds a third copy of the input demuxer list (also in `@ace/toolbox` and the
  watcher's `ffmpeg-input.ts`), because `@studio/hyperframes` depends only on `@studio/shared`.

## Human decisions

- 2026-11-25, Ricardo Fagmer: approved the design (16 answers recorded in the spec) and "Start step 1".
- 2026-11-25, Ricardo Fagmer: typecheck "Skip for now"; tests "No tests yet". Both stay pending.
- 2026-11-25, Ricardo Fagmer: "Go to step 3". Chrome install and `assumingEnabled` could not use the
  gate; answered "Rework them", then "Package install check" and "Package readiness helper".
  Typecheck after step 3: "Skip for now".
