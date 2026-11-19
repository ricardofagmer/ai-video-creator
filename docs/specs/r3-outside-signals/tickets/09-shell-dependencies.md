# 09-shell-dependencies: `apps/shell` package, exact Electron pins and phase 2 read checks (R3-08 part 2)

**What to build:** The empty `@studio/shell` workspace package with the three approved build-time dependencies pinned exactly, the lockfile entries they bring, and the results of phase 2 checks 1, 2, 3, 4 and 6 of `docs/vetting/0002-shell-runtime.md` appended to that report. No shell source code, no framework download, no build.

**Blocked by:** 07-shell-runtime-vetting (integrated; owner approved option P on 2026-11-19)

**Status:** ready-for-agent

## Requirements
- R3-AC-25.1, R3-AC-25.2 (criteria written in `R3-08-graph.md`; SPEC 0006 section 8 R3-AC-25, section 9 R3-08; ADR 0005 decision 2)

## Owner approval needed at super-dev review (not implied by this ticket)
- **Install and lockfile change.** The exact command, run once from the repository root:
  `pnpm add -D --save-exact electron@45.4.1 @electron/packager@20.3.0 @electron/fuses@2.1.3 --filter @studio/shell`.
  Effects: network read of the npm registry, tarballs written to the pnpm store and `node_modules`, `apps/shell/package.json` and `pnpm-lock.yaml` changed. No lifecycle script is expected to run (vetting section 4). It does **not** download the Electron framework.
- **Protected paths.** `apps/shell/package.json` and `pnpm-lock.yaml` must be listed as approved protected paths for this ticket.
- **Read-only network reads** for checks 1, 2 and 6: `npm audit signatures`, `pnpm audit --prod`, `pnpm audit`, and opening the upstream pages named in check 1 and the GitHub advisory list for `electron`. If the worker has no approval or no tool for one of them, that check is reported "not run" in the report and in the return envelope. It is never written as passed.
- Without the install approval the ticket returns `BLOCKED` and writes nothing.

## Technical details
Read `docs/vetting/0002-shell-runtime.md` in full (sections 4, 6, 8, 10, 11) and `apps/watcher/package.json`, `apps/watcher/tsconfig.json`, `apps/watcher/tsconfig.build.json`, `apps/watcher/eslint.config.mjs` for conventions.

Package contract (frozen for tickets 10 and 11; they may not edit these files):

| Field | Value |
|---|---|
| `name` | `@studio/shell` |
| `private` | `true` |
| `version` | `0.1.0` |
| `type` | absent (CommonJS package, like `apps/watcher`; the ESLint config is therefore `eslint.config.mjs`) |
| `main` | `dist/main.js` |
| `dependencies` | absent or empty. The shell main process has no runtime npm dependency |
| `devDependencies`, exact pins | `electron` `45.4.1`, `@electron/packager` `20.3.0`, `@electron/fuses` `2.1.3`: no caret, no tilde, no range |
| `devDependencies`, workspace and tooling | `@studio/eslint-config` `workspace:*`, `@studio/tsconfig` `workspace:*`, `@studio/shared` `workspace:*`, and `@types/node`, `eslint`, `tsx`, `typescript` at the same ranges `apps/watcher/package.json` uses |
| `scripts.build` | bundles `src/main.ts` into the single file `dist/main.js` with esbuild: `--bundle --platform=node --format=cjs --external:electron`. No network, no framework download |
| `scripts.typecheck` | `tsc -p tsconfig.json --noEmit` |
| `scripts.lint` | `eslint .` |
| `scripts.test` | `node --import tsx --test "src/**/*.test.ts"` |
| `scripts.package` | `node scripts/package-app.mjs` (the file is written by ticket 11). It is never part of a turbo task: `turbo.json` is not edited and no `build` script calls it |

Decisions made by this ticket (recorded so the worker does not reopen them):

1. **Bundling is needed, with esbuild.** "Next schedule" must reuse `nextSlots` and the schedule and run schemas of `@studio/shared` instead of a second implementation of time-zone slot arithmetic (ADR 0005 B3 lists duplicated status logic as a cost to avoid). `@studio/shared` depends on `zod`, so the shell imports it as a `devDependency` and esbuild inlines it into `dist/main.js`. The packaged app then holds compiled files only and no `node_modules` (vetting section 9, packaging note).
2. **`esbuild` as a direct devDependency, pinned exactly to a version the lockfile already holds.** The lockfile carries `esbuild@0.28.1` and `esbuild@0.28.2` today. Default: `0.28.2`. The lockfile diff must show no new `esbuild` or `@esbuild/*` package version. If neither version can be reused, stop and return `BLOCKED`: a new esbuild version is a new supply-chain entry that the vetting report did not cover.
3. `tsconfig.json` extends a config of `@studio/tsconfig`. Default: `@studio/tsconfig/library.json` with `rootDir: src`, `outDir: dist`, `include: ["src"]`; `tsconfig.build.json` extends it and excludes `src/**/*.test.ts`, as in `apps/watcher`. `eslint.config.mjs` re-exports one of `@studio/eslint-config/base` or `/nest`. Default: `base` (no Nest in this package). Record the choice of each in the return envelope.
4. `pnpm-workspace.yaml` is **not** edited: `apps/*` already includes `apps/shell`, and no `onlyBuiltDependencies` entry is added (vetting section 6, owner decision).

Order of work:
1. Write `apps/shell/package.json` (workspace and tooling entries only), the two tsconfig files and `eslint.config.mjs` by hand.
2. Run the approved `pnpm add` command above. Do not pass `--ignore-scripts`, `--force`, or any registry or mirror flag.
3. Run the checks below and append their results.

Phase 2 checks owned by this ticket (vetting section 11), each recorded with the date, the command or file read, and the observed result:

| Check | What to do | Stop condition |
|---|---|---|
| 1 | Confirm from the projects' own documentation (`electronjs.org`, `github.com/electron/packager`, `github.com/electron/fuses`) the published install commands and repositories | A different package name or repository than vetting section 2: stop, `BLOCKED` |
| 2 | After the install: `npm audit signatures`; read the lockfile; list every package added; compare with vetting section 4 | Any package outside the section 4 trees, any package the lockfile marks as needing a build (`requiresBuild`) or any `preinstall`, `install` or `postinstall` script: stop, `BLOCKED`, leave the files for the supervisor |
| 3 | Read the installed `electron/install.js`, `cli.js` and `index.js`, and the installed `@electron/get`: record whether first run downloads the framework, the download host, the environment variable names that redirect or skip the download, and whether `SHASUMS256.txt` verification is on by default | none; record facts for ticket 11 |
| 4 | Read the installed `electron.d.ts` and `@electron/fuses` typings: confirm or correct every API, option and fuse name of vetting section 8 (rows 1 to 15) | A section 8 switch that does not exist in 45.4.1 and has no equivalent: record it and flag it in the return envelope |
| 6 | `pnpm audit --prod` and `pnpm audit`; read the GitHub advisory list for `electron` 45 | A high or critical advisory affecting the pinned versions: record it, return `DEGRADED`, do not upgrade on your own |

Checks 5, 7 and 8 need the framework download or the built app. They are **owner-run evidence at the final gate** (see `R3-08-graph.md`). This ticket lists them as pending in the appended section and does not claim them.

Vetting report edit rule: **append only.** Add one new section at the end of `docs/vetting/0002-shell-runtime.md`, titled `## 12. Phase 2 results (ticket 09-shell-dependencies)`, holding one subsection per check (1, 2, 3, 4, 6), a "Corrections to section 8" table when check 4 finds a different name, a "Download redirect variables" list from check 3 for ticket 11, and a "Pending, owner-run" list for checks 5, 7 and 8. No existing line of the report changes, including the status line.

This ticket creates no file under `apps/shell/src`. With no source file, `tsc` reports that no inputs were found, so the typecheck, lint, test and build of `@studio/shell` are first run under ticket 10, not here.

## Acceptance criteria
- [ ] `apps/shell/package.json` matches the package contract table: the three Electron packages carry exactly `45.4.1`, `20.3.0` and `2.1.3` with no range character, `dependencies` is absent or empty, and the five scripts exist with the stated commands.
- [ ] `pnpm-lock.yaml` has an `apps/shell` importer whose three Electron specifiers and resolved versions equal the pins; no new `esbuild` or `@esbuild/*` version entered the lockfile.
- [ ] `pnpm-workspace.yaml`, `turbo.json` and the root `package.json` are byte-identical to before (diff evidence); `onlyBuiltDependencies` still lists exactly `esbuild`, `prisma`, `@prisma/client`, `@prisma/engines`, `playwright`.
- [ ] Every package the lockfile gained is listed in section 12 of the vetting report and is inside the trees of vetting section 4; none needs a build script.
- [ ] Section 12 of the vetting report exists with a dated result for each of checks 1, 2, 3, 4 and 6, or the words "not run" with the reason; checks 5, 7 and 8 appear only under "Pending, owner-run".
- [ ] The report diff is additions at the end of the file only.
- [ ] No Electron framework zip was downloaded: `install-electron` was not run, `electron` was not executed, and no path under the Electron cache directory was created by this ticket (stated with the commands actually run).
- [ ] No file exists under `apps/shell/src`, `apps/shell/scripts` or `scripts/` from this ticket.

## Testing requirements
No test file. Evidence is the manifest, the lockfile diff and the appended report section. The read checks above are run once each; a failed check is reported, never retried with different flags.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request beyond the approved registry and documentation reads, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md`, ADR 0001, ADR 0003, ADR 0005, `tools/cli/**` or `pnpm-workspace.yaml`.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).
- [ ] No git write, no install other than the one approved command, no mirror or registry override.

## EngineOS brief metadata
- Exclusive paths: `apps/shell/package.json`, `apps/shell/tsconfig.json`, `apps/shell/tsconfig.build.json`, `apps/shell/eslint.config.mjs`, `pnpm-lock.yaml`, `docs/vetting/0002-shell-runtime.md` (append-only section 12)
- dependsOn: 07-shell-runtime-vetting
- Owner: backend-coordinator
- Risk: high (new supply-chain entry). Approval at review: the install command and the two protected paths above
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/vetting/0002-shell-runtime.md` (approved, option P), `docs/adr/0005-packaged-shell.md`, `docs/specs/r3-outside-signals/tickets/R3-08-graph.md`
