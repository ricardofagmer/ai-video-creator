# 11-shell-packaging-install: Build script, fuses, ad-hoc signing, install and uninstall steps (R3-08 part 2)

**What to build:** The script that turns the bundled main process into a local, ad-hoc signed `.app` with the vetting section 8 fuses set, and the new steps of `scripts/install.sh` and `scripts/uninstall.sh` that build, install and remove it. The scripts are written here; **the framework download and the first build happen only when the owner runs the installer at the final gate.**

**Blocked by:** 09-shell-dependencies, 10-shell-tray-app

**Status:** ready-for-agent

## Requirements
- R3-AC-25.9, R3-AC-25.10 (criteria written in `R3-08-graph.md`; SPEC 0006 section 9 R3-08; ADR 0005 decision 5 and section D; vetting 0002 sections 5, 6, 8, 9)

## Owner approval and owner-run steps
- This ticket runs no `pnpm --filter @studio/shell run package`, no `scripts/install.sh` without `--dry-run`, and no `scripts/uninstall.sh` without `--dry-run`. Those download the Electron framework or change the owner's Mac. They are owner-run at the final gate.
- Phase 2 checks 5, 7 and 8 of vetting section 11 depend on that owner run. This ticket writes the commands that produce the evidence; it does not claim the checks.

## Technical details
Read: `scripts/install.sh`, `scripts/uninstall.sh`, `scripts/lib/common.sh` (existing conventions: bash 3.2, `run`, `begin_step`, `outcome`, `confirm`, `die`, pt-BR output, `--dry-run` reads state only); `scripts/models/fetch-embedding-model.sh` as the precedent for an announced download; vetting 0002 sections 5, 6, 8, 9 and **section 12** (ticket 09's check 3 and 4 results: the download host, the redirect variable names and the confirmed fuse and option names win over section 8 where they differ); the shell configuration contract in `10-shell-tray-app`.

### `apps/shell/scripts/package-app.mjs` (the `package` script of ticket 09)
A Node script using only `@electron/packager`, `@electron/fuses` and Node built-ins. Steps, in order:
1. Read and validate its arguments: `--node-bin`, `--cli-main`, `--data-home`, `--web-port`, `--api-port` (all required, absolute paths and ports validated with the same rules as the shell configuration schema). Refuse to run when `process.getuid() === 0`.
2. Refuse to run when any download redirect variable recorded in vetting section 12 is set in the environment (default list if section 12 records none: `ELECTRON_MIRROR`, `ELECTRON_CUSTOM_DIR`, `ELECTRON_NIGHTLY_MIRROR`, `ELECTRON_SKIP_BINARY_DOWNLOAD`, `electron_config_cache`, and their `npm_config_` forms). The script never sets one.
3. Require `apps/shell/dist/main.js` to exist (built by `pnpm run build`); it does not build it.
4. Create a staging folder `apps/shell/out/stage/` holding only: a minimal `package.json` (`name`, `version`, `main: "main.js"`), `main.js` copied from `dist/`, and `shell-config.json` written from the arguments with `format: 1`. No `node_modules`.
5. Print one line naming the download host before calling the packager: GitHub releases of `electron/electron` (the exact host text from vetting section 12), the version `45.4.1` and that the zip is cached and reused.
6. Run `@electron/packager` for `darwin` / `arm64` with `electronVersion` read from the installed `electron/package.json` (it must equal `45.4.1`, else stop), `asar: true`, app name `Video Studio`, bundle id `com.videostudio.shell`, `LSUIElement` true (tray-only, no Dock icon), output under `apps/shell/out/`. No `osxNotarize`, no update metadata, no publish step.
7. Flip the fuses on the packaged app with `@electron/fuses`: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `GrantFileProtocolExtraPrivileges` off. Names as confirmed in vetting section 12.
8. Ad-hoc sign after the fuses are flipped (`codesign --sign - --force --deep` on the app, or the fuses and packager options that do the same; **decision for the worker to make and record**, default: an explicit `codesign` call with an argument array) and verify with `codesign --verify --deep --strict`.
9. Print the path of the built app and its size in bytes.

Every child process is started with an argument array and no shell. The script makes no network call of its own: the only network use is the packager's framework download in step 6. Its output carries paths and sizes (an install script, like the existing ones) but no secret; the K7 rule applies to the shell's runtime logs, not to this installer output.

### `scripts/install.sh`: one new step
- `TOTAL_STEPS` becomes 15. New step `step_menu_bar_app`, placed after `step_link_cli` and before `step_launchd` (it needs `NODE_BIN`, `CLI_MAIN` and `DATA_HOME`, and must not depend on the watcher agent). **Decision for the worker to record** if another position is needed.
- New flag `--skip-shell`: the step prints that it was skipped and changes nothing. `usage` and the header comment are updated.
- The step is optional like the embedding model step: any failure warns, adds a summary note and lets the install continue. It never calls `die` for a shell problem.
- Order inside the step:
  1. Require Node at least 22.12 (the `engines` of the three packages, vetting section 2); otherwise skip with a note.
  2. If an installed app exists and its `shell-config.json` inputs and the bundle are unchanged, report "sem mudança" and skip. **Decision for the worker to make and record:** how "unchanged" is detected. Default: a stamp file inside `apps/shell/out/` holding a sha-256 of `dist/main.js` plus the five arguments.
  3. Print the download host line and ask with `confirm` before the first build. `--yes` does **not** answer this question (it "skips the single Homebrew confirmation, and nothing else"). Without a terminal the answer is no and the step is skipped with a note. When the stamp shows only a rebuild from the cache is needed, the question still names the host, since the packager may fetch again.
  4. `run corepack pnpm --filter @studio/shell run package -- --node-bin "$NODE_BIN" --cli-main "$CLI_MAIN" --data-home "$DATA_HOME" --web-port <port> --api-port <port>`, ports from `VIDEO_STUDIO_WEB_PORT` / `VIDEO_STUDIO_API_PORT` validated with `is_number`, else the defaults 4310 and 4311 (add `STUDIO_DEFAULT_API_PORT` to `common.sh`).
  5. Quit a running shell, then copy the built app to the install location with `ditto` and verify the signature of the copy with `codesign --verify --deep --strict`. Install location default: `$HOME/Applications/Video Studio.app` (user-owned, no `sudo`). Refuse to overwrite a path that exists and is not this app (bundle id check).
  6. Print how to open it. The script does not launch the app and does not register a login item: the owner turns on "Abrir ao iniciar sessão" in the menu.
- `--dry-run` prints every command through `run` and performs no build, no download, no copy and no question.
- The summary gains one line for the menu-bar app (installed, unchanged, skipped and why).
- The existing root refusal in `step_platform` covers this step. No `sudo`, no secret asked for or stored, no mirror variable set or exported, no `curl`.

### `scripts/uninstall.sh`: one new step
- Add the same root refusal at the start of `main` (it has none today).
- `TOTAL_STEPS` becomes 6. New step, first in order (before the launchd step): if the installed app exists and its bundle id is `com.videostudio.shell`, run its executable once with `--unregister-login-item` (ticket 10), ask it to quit, then remove the app folder. **Decision for the worker to make and record:** how the running shell is asked to quit; default `osascript -e 'quit app id "com.videostudio.shell"'` with a bounded wait, never `kill -9`.
- Also removes the build output `apps/shell/out/` (a build artefact, ignored by git). It does not remove the Electron download cache; it prints the cache path recorded in vetting section 12 and the command to delete it by hand.
- Anything already gone is reported and skipped. `--dry-run` removes nothing. The removal target is checked before `rm -rf`: an absolute path ending in `.app`, under `$HOME/Applications`, not a symlink, with the expected bundle id.

### Shared paths
`scripts/lib/common.sh` gains the constants and paths both scripts need (bundle id, app name, install location, shell package folder, default api port), defined in `define_studio_paths`. `resolve_repo_root` is not changed.

## Acceptance criteria
- [ ] `apps/shell/scripts/package-app.mjs` imports only `@electron/packager`, `@electron/fuses` and `node:*` modules; it contains no `fetch(`, no `http` request and no assignment or export of any download redirect variable.
- [ ] The script sets all six fuses to the values of vetting section 8 rows 8 to 11, signs ad hoc after the fuse flip and verifies the signature (inspection; fuse names match vetting section 12).
- [ ] The script exits non-zero before any packaging when run as root, when a redirect variable is set, when `dist/main.js` is missing, when an argument is missing or invalid, or when the installed `electron` version is not `45.4.1` (shown by reading the guard code; the guards sit before the packager call).
- [ ] The staging folder holds exactly three files: `package.json`, `main.js`, `shell-config.json`; the written configuration parses with the schema of ticket 10.
- [ ] `bash -n scripts/install.sh`, `bash -n scripts/uninstall.sh` and `bash -n scripts/lib/common.sh` succeed.
- [ ] `scripts/install.sh --dry-run` lists the new step as 12 of 15 (or the recorded position), prints the package command with its five arguments and the `ditto` copy, and changes nothing.
- [ ] In `scripts/install.sh` the host line and the `confirm` call come before the `package` command in the step; `--yes` is not consulted in the step; `--skip-shell` skips it.
- [ ] `scripts/uninstall.sh` refuses to run as root; its new step removes only a folder that passes the four target checks; `--dry-run` removes nothing.
- [ ] `grep -nE "sudo|ELECTRON_MIRROR=|export ELECTRON|curl " scripts/install.sh scripts/uninstall.sh scripts/lib/common.sh apps/shell/scripts/package-app.mjs` shows no use (mentions in refusal messages and comments excepted and listed).
- [ ] The existing 14 install steps and 5 uninstall steps are unchanged apart from their step numbers and totals (diff evidence); the watcher plist template is unchanged.
- [ ] The return envelope lists, as **pending owner-run evidence**, checks 5, 7 and 8 with the exact commands the owner runs (see `R3-08-graph.md`), and every decision marked "for the worker to make and record".

## Testing requirements
No unit test framework exists for the bash scripts; evidence is `bash -n`, the `--dry-run` output of both scripts (read-only by contract) and inspection. If the argument validation of `package-app.mjs` is extracted to a pure module, it lives in `apps/shell/scripts/` with a `*.test.mjs` beside it only if the package `test` script already covers that folder; otherwise it is verified by inspection (the `test` script belongs to ticket 09 and is not edited here). Nothing in this ticket runs the packager, downloads the framework, or installs or removes the app.

Per-ticket checks to list in the check plan: `bash -n` on the three shell files; `scripts/install.sh --dry-run --skip-shell` and `scripts/install.sh --dry-run`; `scripts/uninstall.sh --dry-run`; `turbo run lint --filter=@studio/shell`.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request written by this ticket, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md`, ADR 0003, `apps/shell/package.json`, `apps/shell/src/**`, `tools/cli/**` or `apps/watcher/**`.
- [ ] Runtime logs and errors carry ids, counts and reasons only (SPEC 0006 K7); installer output follows the existing scripts (paths, versions, exit codes, never a secret).
- [ ] Script comments and identifiers in English; owner-facing script output in pt-BR, like the existing steps.
- [ ] No install, no framework download, no build of the app, no git write.

## EngineOS brief metadata
- Exclusive paths: `apps/shell/scripts`, `scripts/install.sh`, `scripts/uninstall.sh`, `scripts/lib/common.sh`
- dependsOn: 09-shell-dependencies, 10-shell-tray-app
- Owner: devops-coordinator
- Risk: high (a script that downloads and signs an executable on the owner's Mac); `security-reviewer` at the final gate
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/vetting/0002-shell-runtime.md` sections 5, 6, 8, 9 and 12, `docs/adr/0005-packaged-shell.md`, the package contract of `09-shell-dependencies`, the shell configuration contract of `10-shell-tray-app`, `docs/specs/r3-outside-signals/tickets/R3-08-graph.md`
