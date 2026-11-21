---
name: 2026-11-20-hyperframes-templates
status: active
owner: Ricardo Fagmer
spec: pending (SPEC 0008, after the pin approval)
domain: backend
security_review: done
preview: pending
risk: medium
new_feature: true
release: false
---

## What
PRD 0001 R4 goal 5: HyperFrames template support next to Remotion (Remotion stays the default).
First step: vet the `hyperframes` npm package at an exact version (vetting 0004 section 5) and get
the owner's approval of the pin before anything is installed. Then SPEC 0008, ADR and tickets.

## Why
Vetting 0004 (spike) found HyperFrames usable for templates under conditions; section 5 requires
a vetted exact pin before the dependency enters the monorepo.

## Scope
In: `docs/vetting/0005-hyperframes-dependency.md`; after approval, SPEC 0008, its ADR and tickets.
Out: any install, any render, any change to the Remotion path.

## Checklist
- [x] Static vetting of `hyperframes` (identity, provenance, versions, manifest, tree, advisories, Chrome, hosts): `docs/vetting/0005-hyperframes-dependency.md`
- [ ] Network trace of one render: not run (owner choice); required by SPEC 0008 before the first render ships
- [x] Owner approves the exact pin: `hyperframes` 0.9.72 exact (2026-11-20)
- [x] SPEC 0008 (frozen rev 1), ADR 0008 (proposed) and tickets R4H-01 to R4H-07 plus graph
- [x] O1 install approval (2026-11-21); ticket 02 install done, see "Install record (R4H-02)"
- [x] Tickets R4H-01 to R4H-06 written; R4H-FP final proof written and run (2026-11-21): lint, typecheck, build, test green over shared, hyperframes, core, watcher, cli (1,381 tests, 0 fail)
- [x] SPEC 0008 rev 2 (section 17, security fixes) frozen with OD10 (a); tickets R4H-08 to R4H-12 (2026-11-21)
- [x] R4H-08 integrated (render.sb matches 17.4 apart from comments; 17 params; DoD grep clean) and R4H-11 integrated (2026-11-21)
- [x] R4H-09 watcher integrated (2026-11-21, DEGRADED): 7 files; AC 88/89/91/96 mapped; Chrome verify runs right after `engineState` ready, before the pin and sandbox-exec checks; `hyperframes.handlers.ts:126` keeps its existing `process.env['PATH']` read for `runtime.path` (not a `-D` value). U15 is false: the launchd template (`apps/watcher/launchd/com.videostudio.watcher.plist.template:57-63`) and `scripts/install.sh:740-751` pass no port variables, so the watcher always uses 4311/4310 (follow-up)
- [x] R4H-10 CLI integrated (2026-11-21, OK): 6 files incl. new `trace-controls.ts`; AC 92/93 mapped; Chrome re-hashed before the render (changed hash = no render, `fail`); C5's own api-port denial is credited to the control
- [x] R4H-12 final proof (2026-11-21, after "Final tests now"): expectations updated (9 test files), lint, typecheck, build green; tests 453 + 405 + 375 + 148 pass, 0 fail (see "Final proof record, rev 2")
- [x] Rev 2 security re-review ran (2026-11-21, owner: "Run reviewer"; first run lost to an API error, retry DEGRADED, verdict MERGE WITH FIXES): F1 medium unix sockets allowed outside four denied places, e.g. `/private/tmp/tmux-<uid>/default` (`render.sb:23,31-39`, M1 remainder); F2 medium renaming writable HF_CACHE_DIR sidesteps the CHROME_DIR path deny so Chrome dylibs can be swapped, unconfirmed Seatbelt behaviour (`render.sb:75-83`, `chrome-binary.ts:91-96`, L1 remainder); F3 low lint misses `srcdoc` and SVG SMIL `to`/`values`/`from` (`template-folder.ts:41,145-160`); F4 low check-to-use gap in Chrome verify (`chrome-binary.ts:93-95`); F5 info shell vs watcher port parsing (`install.sh:569` vs `:744`). M1 partly fixed, L1 partly fixed, L2 partly fixed, L3 fixed. Not reviewed: pinned CLI static server traversal, template JS in node, what `chrome install` reads. Owner accepted F1 to F4 as residual risk (2026-11-21); `security_review` stays `pending`
- [x] Follow-up U15 (2026-11-21, owner chose "HyperFrames U15 ports", code only, not run): the launchd template gains `VIDEO_STUDIO_API_PORT`/`VIDEO_STUDIO_WEB_PORT` with placeholders `__API_PORT__`/`__WEB_PORT__`; `scripts/install.sh` step 13 resolves them (`watcher_port`, `resolve_watcher_ports`): unset or empty takes 4311/4310, else 4 or 5 digits within 1024 to 65535 as the CLI and watcher schemas require, equal ports refused; an invalid value stops the install instead of a KeepAlive restart loop. Evidence: `bash -n scripts/install.sh` parses; no install, plutil or launchctl run. A changed port changes the plist, so the next install restarts the watcher. Not covered: the menu-bar step's `shell_port` still falls back silently on a non-number, and step 14 reads the web port unvalidated (unchanged)
- [x] Security findings (1 medium, 3 low) from R4H-FP: fix wave R4H-08 to R4H-11 integrated; re-review left F1 to F4, accepted by the owner as residual risk (2026-11-21); `security_review` stays `pending`
- [x] Spec deviations (2026-11-21, owner: "next step now, test only in the last task"; code only, not compiled or tested): (1) fixed: `engineRuntime` (`hyperframes-preparation.ts`) reads the gate files before the sandbox profile; an unreadable profile now answers the first gate refusal (`engine-disabled`, `chrome-missing`, `runtime-not-prepared`, `trace-missing`) and `sandbox-unavailable` only where the profile hash would decide (`ready`/`trace-stale`), so AC 70 holds with a missing profile; (2) conforming, comment added: the runner's `process.env['PATH']` is `StageSettings.path`, because the tool runner is spawned with `minimalChildEnv` (`child-env.ts:9`, `tool-runner.client.ts:39`), as sections 4.5 and 17.5 require; (3) conforming, no change: `enable` evaluates readiness as if enabled (`enableRefusal`, `hyperframes-status.ts:87-93`), so with no folder the first missing requirement is Chrome and the text names `chrome install` (O2); section 5.6 asks for the reason `engineState` would give after enabling, and AC 70 (nothing written) holds. Owner may overturn (2) and (3)
- [x] AC 86-96 tests (`ffe93b2`), seed CI fix, template-copy test fix, SPEC 0008 rev 3 (G1-G3 code, G4-G7 text): PR #2 green and merged (`df15161`, 2026-11-21)
- [x] Rev 3 final-gate reviews: `security-reviewer` MERGE OK, `critic` HOLDS WITH GAPS (2026-11-21); six items fixed on `fix/r4h-review-items` (section 18.5)
- [x] Owner-run O2 Chrome install (AC 84): Chrome 158.0.8127.36 installed, `chrome.json` written (2026-11-21)
- [x] Owner-run O3 network trace (AC 98): `pass` at 2026-11-21T18:25:23Z after two design fixes (spec 18.6: network rule, `HYPERFRAMES_CHROME_SANDBOX=0`; spec 18.7: C1 proven by EPERM, macOS 27 logs no profile denial); render exit 0, video correct, other network denials 0, `~/.hyperframes` reads denied 0
- [x] Owner-run O4 part 1: `studio hyperframes enable` (2026-11-21); watcher restarted on the 18.6 build
- [ ] Owner-run O4 part 2: first live render with a recipe version binding `title-card-hf-template@1` (AC 85, last sentence): not done; needs `studio catalog seed`, `studio start`, a recipe version and a live run

## Final proof record, rev 2 (R4H-12, 2026-11-21)
Owner: "Final tests now" after commit 7d93404 turned PR #1 CI red at watcher typecheck (all errors in test files). Expectation updates only: no new test file, no new `it`/`describe`, no deleted, skipped or weakened assertion, no production file.

| File | Old | New | Rev 2 section |
|---|---|---|---|
| `apps/watcher/src/hyperframes-runtime/hyperframes-runtime.fixtures.harness.test.ts` | `runtimeFixture` with the rev 1 fields; `expectedRenderArgs` with one `-D` pair | nine new fields (owner home, studio root, data home, HF root, Chrome dir, ffmpeg, ffprobe, ports 4311/4310); oracle restates the seventeen pairs in frozen order and takes `templateDir` | 17.5 |
| `apps/watcher/src/hyperframes-runtime/render-command.test.ts` | `buildRenderArgv` without `templateDir`; length 15 | `templateDir` passed; length 47 | 17.5 |
| `apps/watcher/src/hyperframes-runtime/render-picture.test.ts` | oracle without `templateDir`; bin at `args[5]`, node at `args[4]` | `templateDir` passed; bin at `args[37]`, node at `args[36]` | 17.5 |
| `apps/watcher/src/stages/process/runner/hyperframes.handlers.test.ts` | runtime with seven fields; ports without `realPath` | nine new fields; fake `realPath` answers each path unchanged; oracle gets `templateDir` | 17.5 |
| `apps/watcher/src/stages/process/runner/hyperframes-render-request.schema.test.ts` | `validRuntime` with seven string fields | nine new fields, ports as numbers | 17.5 |
| `apps/watcher/src/stages/executors/composition-stage.harness.test.ts` | fake ports without the six rev 2 members; settings without `studioPorts` | in-memory `verifyChromeBinary` (records the call, always matches), `resolveExecutable` (bare name under `FAKE_TOOLS_DIR`), identity `realPath`/`realPathOfExistingPrefix`/`realFolder`, `studioRoot()`; `studioPorts` 4311/4310 | 17.5, 17.6 |
| `apps/watcher/src/stages/executors/composition.executor.dispatch.test.ts` | expected request runtime with seven fields | nine new fields from the harness ports | 17.5 |

| `tools/cli/src/hyperframes/hyperframes-cli.harness.test.ts` | seeded `chrome.json` sha-256 `'c'.repeat(64)`, size 1000; child PATH `/usr/bin:/bin` | sha-256 and byte length of the placeholder shell bytes; placeholder `ffmpeg`/`ffprobe` (never run) in `<temp>/tools`, child PATH `<temp>/tools:/usr/bin:/bin` | 17.5, 17.6 |
| `tools/cli/src/commands/hyperframes-trace.command.test.ts` | 2 starts (one control, render); exit script `[0, 3]`; render read as `requests[1]` | 6 starts (C1 to C5 each `-e`, no `render`, then the render); exit script `[0,0,0,0,0,3]`; render read as the last start | 17.9 |

Checks, once each at the final revision (`pnpm --filter @studio/{shared,hyperframes,core,watcher,cli}`): lint green; typecheck green; build green; test shared 453/453, core 405/405, watcher 375/375, CLI 148/148. CLI lint and typecheck were not rerun after the last trace-test edit (expectation lines only); CI covers them.
Repair: CLI tests red three times (16 chrome-missing, then 16 sandbox-unavailable, then 2 trace start-count). Attempts 1 and 2 fixed the harness; the bound was spent, and the owner approved one extra attempt ("One more attempt"), which turned the run green.

AC evidence (no new test, per OD8):
- AC 87: existing tests updated to the 47-argument argv in 17.5 order (`render-command.test.ts`, `render-picture.test.ts`, `hyperframes.handlers.test.ts`).
- AC 89: the schema test accepts the strict runtime with the nine fields and still rejects an unknown runtime key; the missing-field and port-range rejections have no case.
- AC 93: the trace test checks that C1 to C5 run before the render under `sandbox-exec`; deep-equal `-f`/`-D` and per-control findings have no case.
- AC 86, 88, 90, 91, 92, 94, 95, 96, 97: not inspected in this run; their tests are the next task (17.13).
- AC 98, AC 84, AC 85: pending (owner-run O2/O3).

## AC 86-97 tests, the 17.13 "next task" (2026-11-21)
Owner: "AC 86-97 tests". Four test-writer units (opus, `parallel-independent`), tests only, no production file, nothing run. Supervisor inspection of the integrated diff: 11 test files only (7 new, 4 extended, +3,569 lines in new files, +544/-11 in extended), no `.only`/skip, no process start, no Keychain call, no `ricardo-clone/`, env planting through the existing `withParentEnv` helper.

| AC | File(s) | Covered |
|---|---|---|
| 86 | `apps/watcher/src/hyperframes-runtime/sandbox-profile.test.ts` | rule order vs 17.4 (comments stripped), last rule, no `/Users/`/4310/4311, seventeen `(param)` names equal the `-D` names |
| 87 | `apps/watcher/src/hyperframes-runtime/sandbox-args.test.ts` | values with spaces stay one argument; relative/empty/NUL/LF/CR in every path parameter and ports 1023/65536/0/4310.5/NaN throw before a start; output unchanged under planted env |
| 88 | `apps/watcher/src/hyperframes-runtime/executable-paths.test.ts` | absolute setting through a symlink, first executable on PATH (skips non-executable and directory), relative PATH entry ignored, no match throws; `realPathOfExistingPrefix` |
| 89 | `hyperframes-render-request.schema.test.ts`, `composition.executor.hyperframes-refusals.test.ts`, harness | each of the nine fields missing, ports out of range, relative paths; stage `sandbox-unavailable` (ffmpeg/ffprobe unresolvable, ports) and `runtime-not-prepared` (cache/config/home), zero starts; eleven env keys cited at `hyperframes.handlers.test.ts:173` |
| 90 | `apps/watcher/src/hyperframes-runtime/chrome-binary.test.ts` | symlink, outside cache, symlinked folder, sibling-prefix folder, directory, missing, other size, last byte changed (2 MiB + 1 file); unchanged accepted |
| 91 | `composition.executor.hyperframes-refusals.test.ts` | changed or unreadable binary with gate files ready: `chrome-missing`, zero starts, one `render-refused` event, no staging |
| 92 | `tools/cli/src/commands/hyperframes-trace.command.test.ts` | failing binary: no start, no `trace.json`; `chromeSha256` from bytes after the render; change before or after the render fails with a finding |
| 93 | same file, `tools/cli/src/hyperframes/trace-controls.test.ts` (new) | same `-f`/`-D` prefix on all six starts; each of C2-C5 not refused fails naming it (C5 timeout too); C3 file removed and reported; control vs informational denials |
| 94, 95 | `packages/shared/src/hyperframes/template-folder.test.ts` | all seventeen AC 94 refusals; AC 95 data:, `&amp;` query, `data-src`, local image-set (seed case cited) |
| 97 | none | one-time inspection of the rev 2 wave; does not apply to this task |

Gaps: FIFO source and FIFO Chrome path (needs `mkfifo`, a process); a source growing after `fstat`; single `O_NOFOLLOW` open, "reads no file" and "starts no program" by inspection; schema byte-identity by inspection.
Findings for the spec owner (no fix): AC 89 missing `cache/` is unreachable (gate answers `chrome-missing` first); a C3 leftover fails the trace even at exit 0 (`network-trace.ts:216`, not in 17.9); an unreadable binary after the render writes no `trace.json` (`network-trace.ts:173`); `checkChromeHash` skips the cacheDir containment `verifyChromeBinary` does; AC 86 "six rev 1 rules after it" reads as five network rules plus the final deny; `resolveExecutable` stricter than 17.5; ffmpeg path sent twice (`tools.ffmpegPath` and `runtime.ffmpegBin`).
Validation: `[validation] deferred to release — not a release (11 files, risk high)`. Before running, build `@studio/hyperframes` (the watcher resolves its `dist/`).

## Final proof record (R4H-FP, 2026-11-21)
- Tests: 25 new `*.test.ts` files (shared hyperframes, core catalog/asset-store/seed, watcher hyperframes-runtime, runner, executors, stage texts, CLI hyperframes commands). No `.only`, no skip; fake process port and temp data homes only.
- Commands, once each, `pnpm --filter @studio/{shared,hyperframes,core,watcher,cli}`: lint green; typecheck red twice then green (test implicit any; `@studio/hyperframes` unresolvable under watcher `moduleResolution: node`, fixed by top-level `main`/`types`, owner-approved); build green; test 453 + 405 + 375 + 148 pass, 0 fail.
- Inspections: AC 64 (one manifest, one lockfile version, integrity equals vetting 0005), AC 65 (install record above, workspace file unchanged, all tarballs from registry.npmjs.org), AC 66 grep (no npx, shell:true, env spread), AC 72 (packages/video and named symbols unchanged), AC 82 grep, AC 83 (no prisma/platforms/connections/publishing change, API_CONTRACT_REVISION 7, no new secret name) all pass.
- `engineos compliance diff --base HEAD`: first run 3 test-sentinel matches (digits in fixture values), fixed; rerun clean.
- Gaps (production ports missing, not covered): AC 68 wrong-version on a temp node_modules (`pinned-bin.ts:57`); AC 79 mux cut and adopted streams (`hyperframes.handlers.ts:125-140`); AC 81 runner reply and errorKind (`tool-runner.main.ts:52,83`); AC 73 seed-recipes e2e; CLI pin-mismatch; handler tests are macOS-only (real sandbox-exec existence check).
- Spec deviations found: sandbox profile read before engine-disabled (`hyperframes-preparation.ts:41-47`); handler PATH from runner env, not StageSettings.path; `enable` with no folder reports chrome-missing.
- Security review (read-only, 0 critical, 0 high): M1 sandbox profile `(allow default)` leaves exec/mach/unix-socket/loopback/write paths a log trace cannot see (`render.sb:11-17`); L1 Chrome binary never re-hashed (`engine-file-io.ts:92-95`); L2 template self-contained check bypassable (`template-folder.ts:30-32,50-67`); L3 template copy follows source symlink, no byte cap until after copy (`hyperframes-template-copy.ts:52-53`); 6 info. Auth test `rev7-routes.guard.test.ts` clear.
- AC 84, AC 85: pending (owner-run).

## Install record (R4H-02)
- Approval: owner, 2026-11-21, for exactly `pnpm install` at the repository root and `npm audit signatures`.
- Manifests: `hyperframes` is named only in `packages/hyperframes/package.json`, as `"0.9.72"` (no range);
  `@studio/hyperframes` is added to `apps/watcher` and `tools/cli`. `pnpm-workspace.yaml` unchanged.
- `pnpm install` (pnpm 10.12.1): +40 packages, no build script reported as ignored, so no new
  `onlyBuiltDependencies` entry is needed. Lockfile diff: 366 lines added, none removed or changed.
- Lockfile: one `hyperframes` version, 0.9.72, integrity `sha512-c7dC2WL0rFnC...`. No tarball outside
  `registry.npmjs.org`. On disk only darwin-arm64 platform packages exist (`@img/sharp-darwin-arm64`
  0.35.5, `@img/sharp-libvips-darwin-arm64` 1.3.4, `@esbuild/darwin-arm64` 0.28.2); the other
  platforms' optional packages are listed in the lockfile but not installed.
- Differences from the vetting 0005 tree (npx cache, 74 package folders), each inside the range the
  depending package declares:
  - newly resolved newer releases: `@hono/node-server` 2.1.11 (vetted 2.1.8, range `^2.1.6`),
    `puppeteer-core` 25.18.1 (vetted 25.17.0, range `^25.10.0`), `typed-query-selector` 2.12.4
    (vetted 2.12.3, range `^2.12.3`);
  - reused versions already in the workspace lockfile: `hono` 4.13.19 (vetted 4.13.18, range
    `^4.13.16`), `source-map-js` 1.2.4 (vetted 1.2.2), `@swc/helpers` 0.5.15 (vetted 0.5.24);
  - peer resolution: `@types/node` 22.20.5 (already in the workspace).
  `puppeteer-core` drives Chrome, so its drift is also covered by the O3 network-trace gate.
- `npm audit signatures`: "audited 884 packages ... 884 packages have verified registry signatures;
  207 packages have verified attestations". Zero invalid, zero missing.

## What was made
Rev 2 security-fix wave (2026-11-21, not compiled, not tested, not security-reviewed by owner choice):
R4H-08 `render.sb` keeps `(allow default)` plus targeted denies (process-exec allowlist of four
real paths, ten mach services incl. the two Keychain services, file-write and sensitive-read
denies, studio ports, unix sockets), 17 `-D` parameters via `buildSandboxArgs`, `resolveExecutable`,
`realPathOfExistingPrefix`, `verifyChromeBinary`/`hashChromeBinary`. R4H-09 watcher resolves every
parameter as a real path, verifies Chrome on every render and stages templates through a bounded
no-follow copy. R4H-10 CLI trace runs controls C1–C5 under the render's sandbox args and records the
post-render Chrome hash. R4H-11 template lint decodes character references, strips URL whitespace,
and covers more attributes, meta refresh and `image-set()`.

Vetting 0005 written from static checks only: nothing installed, downloaded or run. 0.9.72 has
provenance from the upstream publish workflow, no lifecycle script, 75 packages with no known
advisory; 0.9.17 (the newest release at least 14 days old) pins `undici` 7.25.0 with high advisories.

## Human decisions
| Date | Who | Reason ids | Decision |
|---|---|---|---|
| 2026-11-20 | Ricardo Fagmer | — | Next wave: HyperFrames templates (vetting first, then SPEC 0008) |
| 2026-11-20 | Ricardo Fagmer | evidence-insufficient | Skip the traced render; vetting 0005 from static checks; trace becomes a SPEC 0008 gate |
| 2026-11-20 | Ricardo Fagmer | — | Approve pin `hyperframes` 0.9.72 exact (no range); install only by the SPEC 0008 ticket, lockfile reviewed, `npm audit signatures` after install |
| 2026-11-20 | Ricardo Fagmer | — | SPEC 0008 OD4 (a) studio-owned Chrome cache, OD5 (b) sandbox every render, OD6 (a) vocabulary plus recipe values, OD7 (a) one seed template; spec frozen rev 1 |
| 2026-11-21 | Ricardo Fagmer | external-effect | O1: approve `pnpm install` and `npm audit signatures` for ticket R4H-02 |
| 2026-11-21 | Ricardo Fagmer | — | R4H-FP final checkpoint: "Run proposed checks" — write the ticket 07 tests, then `pnpm --filter @studio/shared --filter @studio/hyperframes --filter @studio/core --filter @studio/watcher --filter @studio/cli run lint`, `typecheck`, `build`, `test`, once each |
| 2026-11-21 | Ricardo Fagmer | — | R4H-FP repair: "Allow manifest fix" — add top-level `main` and `types` to `packages/hyperframes/package.json` (watcher `moduleResolution: node` could not resolve the package), then typecheck repair attempt 2, build and test once |
| 2026-11-21 | Ricardo Fagmer | — | R4H-FP security findings: "Fix before enable" — M1, L1, L2, L3 stay open; `security_review` stays `pending`; next wave tightens `render.sb` (spec 4.6/6 change, owner-approved) and fixes L1-L3, then the review reruns; O3 trace and O4 enable wait for it |
| 2026-11-21 | Ricardo Fagmer | — | Security-fix wave scope: "No tests, next task" — M1, L1, L2, L3 only; no testability ports, no new tests; spec deviations stay open |
| 2026-11-21 | Ricardo Fagmer | — | M1 approach: "Allow default + denies" — keep `(allow default)` in `render.sb`, add process-exec, mach-lookup, file-write and sensitive-read denies; SPEC 0008 sections 4.6 and 6 amended |
| 2026-11-21 | Ricardo Fagmer | — | SPEC 0008 rev 2 (section 17): "Freeze rev 2"; OD10: "(a) Add Keychain denies" — `com.apple.SecurityServer` and `com.apple.securityd.xpc` in the `mach-lookup` deny list under the U12 fallback; tickets 08 and 11 ready |
| 2026-11-21 | Ricardo Fagmer | — | Rev 2 prototype preview: "No preview, implement" — wave A (R4H-08, R4H-11) goes straight to production files, no tests, no checks |
| 2026-11-21 | Ricardo Fagmer | budget-exhausted | Wave A workers dropped on ECONNRESET before any write (R4H-08 twice, R4H-11 once): "Retry both workers" — fresh workers, same briefs |
| 2026-11-21 | Ricardo Fagmer | budget-exhausted | R4H-11 worker dropped again (2 attempts, no write): "Do it here" — supervisor edits `template-folder.ts` in-session; R4H-08 worker keeps running |
| 2026-11-21 | Ricardo Fagmer | — | Today's push scope: "Security fixes only" — R4H-08 to R4H-12 plus the security re-review; the 4 test gaps and 3 spec deviations stay open; tests only at the end |
| 2026-11-21 | Ricardo Fagmer | — | R4H-12 final checkpoint: "Skip for now" — no test-expectation edits and no lint, typecheck, build or test; `[validation] pending — final-stage user approval required` |
| 2026-11-21 | Ricardo Fagmer | — | Rev 2 security re-review: "Decline security review" — no reviewer, no scan; `security_review` stays `pending`; M1 and L1 to L3 fixes are unverified |
| 2026-11-21 | Ricardo Fagmer | — | "Run the checks before committing?": "Not now" — checks stay pending, nothing committed |
| 2026-11-21 | Ricardo Fagmer | — | Next step "HyperFrames U15 ports" (R4 platform minors found already fixed or accepted as residuals); code only, tests deferred to the final run |
| 2026-11-21 | Ricardo Fagmer | — | "Go to the final run", then at the ticket 12 final checkpoint (expectation updates plus lint, typecheck, build, test over shared, hyperframes, core, watcher, cli): "Skip for now" — nothing edited or run, ticket 12 stays blocked, `[validation] pending — final-stage user approval required` |
| 2026-11-21 | Ricardo Fagmer | — | After "Propose a commit": "next step now, test only in the last task" — commit proposal set aside; the 3 spec deviations taken as the next build step; all tests and checks stay for the last task |
| 2026-11-21 | Ricardo Fagmer | — | "Final tests now"; repair bound spent at CLI 146/148, owner: "One more attempt" — trace expectations moved to 5 controls plus the render; CLI 148/148 |
| 2026-11-21 | Ricardo Fagmer | — | Rev 2 security re-review: "Run reviewer" — read-only `security-reviewer`, no scan; result MERGE WITH FIXES (F1, F2 medium; F3, F4 low; F5 info) |
| 2026-11-21 | Ricardo Fagmer | — | "done, next phase", then "AC 86-97 tests (Recommended)": approves writing the SPEC 0008 17.13 "next task" tests (OD8/K17/AC 97 bound only the finished rev 2 wave); written by four test-writer units, not run until the final checkpoint |
| 2026-11-21 | Ricardo Fagmer | security-accept | Rev 2 re-review findings: "Accept as residual risk" — F1 (unix sockets outside the four denies, `render.sb:23,31-39`), F2 (HF_CACHE_DIR rename around the CHROME_DIR deny, dylibs unhashed), F3 (lint misses `srcdoc`, SVG SMIL), F4 (Chrome verify check-to-use gap) accepted, not fixed; F5 info noted. Engine stays off until O3 passes (AC 98); `security_review` left `pending` (accepting findings is not a clean review) |
| 2026-11-21 | Ricardo Fagmer | — | R4H-FP security: "Run reviewer and scan" — read-only `security-reviewer` over the SPEC 0008 diff plus `apps/api/src/auth/rev7-routes.guard.test.ts`, and `engineos compliance diff` once |
| 2026-11-21 | Ricardo Fagmer | security-accept | After "New branch and PR" then "same branch": "Mark done (accepted)" — `security_review` set to `done` on the recorded acceptance of F1 to F4 (residual risk, not fixed); the secret and injection scans at commit, push and PR still apply. Seed-entry CI fix: "Skip, let CI run it" — the test file was not run locally |
| 2026-11-21 | Ricardo Fagmer | — | PR #2 CI (run 44914642913): core seed tests green; 1 watcher failure in `hyperframes-template-copy.test.ts` (AC 96), a test bug — three tests read `sizeBytes` before the lazy `listingEdit` set it, so the limit stayed 0. Fixed in the test only (size passed as a function); repair attempt 1 of 2, not run locally |
| 2026-11-21 | Ricardo Fagmer | — | Next wave "Fix the HyperFrames code gaps": G1 "Write a failing record", G2 "Check folders first", G3 "Mux uses ffmpegBin", G4-G7 "Spec text only" — recorded as SPEC 0008 section 18 (rev 3). Risk high (sandbox/trace code), autonomy A3; `security_review` back to `pending` for the rev 3 code (`security-reviewer` and `critic` at the final gate) |
| 2026-11-21 | Ricardo Fagmer | — | After PR #2 merged ("we need finish this today"): "Security review + critic", "Walk me through O2/O3/O4", "Close the change record"; then on the six review items: "Fix all 6, new branch + PR" |
| 2026-11-21 | Ricardo Fagmer | — | "Run proposed checks", "Rerun on the fix diff", "Commit as proposed", "Push and open PR"; rerun CLEAN with one LOW and one INFO: "Fix both, then commit" — watcher typecheck and tests rerun (578/578); `security_review` set to `done` on the clean rerun with both items fixed |
| 2026-11-21 | Ricardo Fagmer | — | PR #3 opened (`9898f2e`); change record: "Keep open until O4" — stays active until the owner runs O2, O3 and O4 (AC 84, 85, 98) pass, then it is closed and archived |
| 2026-11-21 | Ricardo Fagmer | — | O3 first run failed (C1 timeout, Chrome SIGTRAP): "Apply both fixes" (spec 18.6) |
| 2026-11-21 | Ricardo Fagmer | — | O3 second run: control denial not in the log (macOS 27.3 logs no `sandbox-exec` profile denial): "Exit code is proof" (spec 18.7, AC 107-108); third run `pass`; owner ran `studio hyperframes enable` |
| 2026-11-21 | Ricardo Fagmer | — | First live render not yet run: "Ship fixes now, O4 later" — trace fixes go on a new branch and PR; the record stays active until the first live render reaches review |

## Rev 3 gaps (SPEC 0008 section 18, 2026-11-21)
- G1 `tools/cli/src/hyperframes/network-trace.ts`: an unreadable binary after the render no longer throws; the record is written with `result: 'fail'`, `chromeSha256` of 64 zeros and `TRACE_CHROME_UNREADABLE_AFTER_TEXT` (`hyperframes-texts.ts`). Test: AC 99 in `hyperframes-trace.command.test.ts`.
- G2 `apps/watcher/src/stages/composition/hyperframes-preparation.ts`: `preparedFolders` runs before `chromeUnchanged`. Test: AC 100 assertion (no Chrome verification) in `composition.executor.hyperframes-refusals.test.ts`.
- G3 `apps/watcher/src/stages/process/runner/hyperframes.handlers.ts`: the mux runs `runtime.ffmpegBin`; schema unchanged. Test: AC 101 in `hyperframes.handlers.test.ts`.
- ffprobe sent twice: left at first, fixed in the review items below (owner chose "Fix all 6").
- Validation: PR #2 CI green on `660e678` (lint, typecheck, test, build); merged as `df15161`. Supervisor inline (`dispatch=none`).

## Rev 3 final-gate reviews (2026-11-21)
Owner: "Security review + critic", "Walk me through O2/O3/O4", "Close the change record". Both read-only, on `git show 660e678`, no scans, no runs.
- `security-reviewer` (1m42s): **MERGE OK**. G1 cannot make `engineState` ready (`network-trace.ts:228`, `engine-state.ts:35`); the zero hash leaks nothing; G2 keeps Chrome verify before every ok return; G3's `ffmpegBin` is parent-resolved and schema-checked. LOW: ffmpeg/ffprobe resolved under a sandbox-writable folder would run unsandboxed in the mux (pre-existing). INFO: ffprobe still used the unresolved setting.
- `critic` (1m58s): **HOLDS WITH GAPS**. AC 99-101 tests do distinguish the old code; G4-G7 claims hold; schema unchanged since 7d93404. Minor: (1) AC 99 did not assert control findings are kept; (2) binary removed before the render wrote a false "after the render" finding; (3) stale docstring `hyperframes-trace.command.ts:21-24`; (4) stale docstring `hyperframes-preparation.ts:134`; evidence gap: handler test comment said "never start it".
- Owner: "Fix all 6, new branch + PR" — branch `fix/r4h-review-items` from `origin/main` (`df15161`). SPEC 0008 section 18.5 (AC 102-104). Changes: `mediaProgramsOutsideWritableFolders` refusal (`sandbox-unavailable`) in `hyperframes-preparation.ts`; both picture probes on `runtime.ffprobeBin` in `hyperframes.handlers.ts`; "after" finding only when the render ran (`network-trace.ts`); docstrings; tests: AC 102 (refusal cases, harness `resolvedExecutables` and `redirectedFolders`), AC 103 (settings ffprobe now differs from `runtime.ffprobeBin`), AC 104 (C5 removal), AC 99 keeps a C2 finding.
- Local checks (owner: "Run proposed checks"), once each: hyperframes build, watcher and CLI typecheck exit 0; watcher tests 576/576, CLI tests 189/189.
- `security-reviewer` rerun on the fix diff (owner: "Rerun on the fix diff", 1m26s): **CLEAN**. LOW: the check stood in the data home for the writable folders, so a `config/`, `cache/` or `home/` symlinked outside it was not covered. INFO: the docs wrongly placed the scratch folder under the data home (`scratch-dir.ts:12` uses the temp folder; it is safe because it is created after the programs are resolved). Owner: "Fix both, then commit" — the refusal now also checks the real `config/`, `cache/` and `home/` (two more AC 102 cases), and the wording in spec 18.5 and the docstring is corrected.
