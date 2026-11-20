# 0005. Add a thin menu-bar shell that controls the api and web, and keep the watcher under launchd

Date: 2026-11-19
Status: proposed; the owner chose A2 + B1 + C1 (thin Electron menu-bar shell, watcher stays under launchd) on 2026-11-19 (SPEC 0006 Q1, "Electron menu-bar (Recommended)"). Vetting 0002 (`docs/vetting/0002-shell-runtime.md`) was approved with option P on 2026-11-19, and R3-08 part 2 was implemented by tickets 09 to 12 (see "Decision record (R3-08)"). Acceptance follows review, as for ADRs 0001-0004.

Decider: Ricardo Fagmer. The decision is the owner's; this ADR recommends and does not decide
(SPEC 0006 Q1). Sources: PRD 0001 (`docs/prds/0001-video-studio.md`) D4, D8, D9, section 3 (R3:
"a packaged `.app` or menu-bar shell if still wanted"), section 11, section 12; ADR 0001 (last
revisit trigger: "A packaged `.app` is approved for R3: reopen the launchd and `studio start`
split"); ADR 0003 (single writer); the owner's decision of 2026-11-19 that R3 includes the
packaged shell; SPEC 0006 (`docs/specs/0006-r3-outside-signals-and-packaging.md`) sections 5.6 and
9 (R3-08); the EngineOS rule that active development is JavaScript/TypeScript (`rules/base.md`
"Active ecosystem"); the code read on 2026-11-19.

Statements marked **Unverified** were not confirmed against vendor documentation in this pass and
must be checked in the vetting report before any dependency is added.

## Context

Today (**Fact**, code read 2026-11-19):

- The watcher is a launchd user agent, label `com.videostudio.watcher`, with `RunAtLoad` and
  `KeepAlive`, restarted at login and after any exit
  (`apps/watcher/launchd/com.videostudio.watcher.plist.template`). Its plist holds no secret.
- The api and web are started by `studio start` as detached Node processes bound to `127.0.0.1`,
  each recorded in `<data home>/logs/<name>.pid.json`
  (`tools/cli/src/services/service-spec.ts:33-35`, `service-manager.ts:119-135`). After a reboot
  the owner must run `studio start` again (ADR 0001, consequences).
- The web needs the passphrase session of D8; the api rejects unauthenticated calls even on
  loopback.
- Everything is installed from the checkout by `scripts/install.sh`, which needs Homebrew, Node
  22+, ffmpeg, a Playwright browser and, since R2, a local embedding model. The studio is not a
  self-contained bundle.

What R3 changes: scheduled runs (SPEC 0006 section 5.6) make the studio work while no window is
open, so the owner needs a glance-level answer to "is it running, what is next, is something
waiting for my review" without opening a terminal. That is the job a shell can do. One user, one
Mac; distribution to other machines is a PRD non-goal.

Forces:

- The watcher must outlive every interface (PRD criterion 12) and must run for schedules to fire.
- One language and one runtime is a stated benefit of ADR 0001, and the EngineOS rule limits
  active development to JavaScript/TypeScript.
- PRD 12: local only, no telemetry, no auto-update channel, no secret in any file.
- A shell is a new, long-lived, privileged-looking process with its own supply chain.

## Options considered

### A. What the shell is

1. **No shell.** Keep `studio start`, the web and the CLI.
   - Pros: nothing to build, sign or keep patched; no new dependency.
   - Cons: after every reboot the web is down until a terminal command; schedules and missed slots
     are invisible without opening the web or the CLI; the owner asked for the shell in R3.
2. **Thin menu-bar shell.** A tray icon with a menu: state of watcher, api and web; "Iniciar" and
   "Parar"; "Abrir estúdio" (opens the default browser on the local web); the next scheduled slot;
   the count of runs at `review`; missed slots in the last 7 days. No window that renders the
   studio.
   - Pros: answers the glance-level questions; the studio keeps running in the owner's normal
     browser, with its existing session cookie and the browser's own security updates; the shell
     renders no remote or authenticated content, so its attack surface is a menu; small scope.
   - Cons: the studio is still "a browser tab"; one more always-on process.
3. **Full `.app` window.** The shell embeds a web view that shows the local web, plus the tray.
   - Pros: feels like one application; no browser tab to find.
   - Cons: the embedded web view becomes the browser for an authenticated application, so its
     engine must be kept patched by us; session cookie storage, downloads, file pickers, media
     playback of `final.mp4` with range requests, and external links all need their own handling
     and their own security review; a larger surface for the same features.

### B. What the shell is built with

1. **Electron** (TypeScript main process, bundled Chromium and Node).
   - Pros: the only option that keeps one language; tray, menu and login-item APIs are in the
     main process; can spawn or signal the existing Node services directly; mature packaging.
   - Cons: a large bundle for a small menu (about 200 MB on disk, **Unverified**); an idle
     Electron process uses memory in the range of a browser tab or more (**Unverified**, to be
     measured); frequent major releases with a short support window (**Unverified**: the latest
     three majors), so staying patched is recurring work; its install script downloads a binary,
     which must pass dependency vetting like `onnxruntime-node` did (ADR 0004).
2. **Tauri** (Rust core, the system WKWebView, a JavaScript front end).
   - Pros: small bundle (about 10 MB, **Unverified**) and low idle memory; tray support.
   - Cons: a Rust toolchain enters the install and the build; any behaviour outside the stock
     plugins is Rust code, which the JavaScript/TypeScript rule does not allow without a recorded
     exception; running the Node services means shipping or locating Node as a sidecar; WKWebView
     differs from the Chromium the web is developed against (only matters for option A3).
3. **Native Swift** (SwiftUI `MenuBarExtra` or AppKit `NSStatusItem`).
   - Pros: the smallest and most native result; a menu-bar app is a few hundred lines; no bundled
     runtime; no third-party dependency at all.
   - Cons: a second language and toolchain (Xcode) for one small component, against the
     JavaScript/TypeScript rule; nobody else in the repository can reuse its code; status logic
     (pid records, heartbeat, schedule files) would be written twice, once in TypeScript and once
     in Swift, unless the app only shells out to `studio status --json`.
4. **A Node tray helper library** (a Node package that drives a small prebuilt native tray
   binary).
   - Pros: TypeScript only, tiny.
   - Cons: these packages ship an opaque prebuilt binary and the ones known to this author are
     thinly maintained (**Unverified**); weak fit for `rules/security.md` supply-chain review.
     Listed for completeness; not recommended.

### C. How the shell relates to launchd and `studio start`

1. **Watcher stays under launchd; the shell controls only api and web.** The shell starts and
   stops them through the same service manager and the same pid records as `studio start` and
   `studio stop`, so the two interoperate; the shell can be a login item so the web is up after a
   reboot.
   - Pros: the watcher still outlives every interface, including the shell; quitting or crashing
     the shell never interrupts a run or a schedule; D9 changes by one clause only.
   - Cons: two supervisors remain (launchd and the shell); the shell must not assume it started a
     process it finds running.
2. **Three launchd agents** (watcher, api, web), the shell only shows state and calls `launchctl`.
   - Pros: one supervisor; everything returns at login without the shell.
   - Cons: api and web would listen permanently, which D9 chose against; three plists to install
     and remove; a crash loop of the web under `KeepAlive` is harder to notice.
3. **The shell supervises all three and launchd is removed.**
   - Pros: one place to look.
   - Cons: quitting the shell stops the watcher, which breaks criterion 12 and stops schedules;
     crash-resume would depend on a GUI process. Rejected.

### D. Signing and notarization

- An app built on the owner's own Mac by `scripts/install.sh` is not downloaded, so it carries no
  quarantine attribute and Gatekeeper does not block it (**Unverified** in detail; to be confirmed
  on the target macOS version). Apple Silicon requires every executable to be at least ad-hoc
  signed; a locally assembled bundle is signed ad hoc at build time (`codesign --sign -`), with no
  Apple account.
- Distribution to any other Mac needs a Developer ID certificate (a paid Apple Developer Program
  membership), the hardened runtime with the entitlements the runtime needs, and notarization of
  every release. None of this is needed for one user on one Mac, and it is out of scope.
- No auto-update channel in any option: an updater is an outbound connection and a code-execution
  path, against PRD 12. Updates come from the checkout and `scripts/install.sh`.
- The shell stores no secret. Provider keys stay in the Keychain and are read only by the watcher;
  the passphrase is typed in the browser, never in the shell.

## Decision

**Proposed, for the owner to accept, change or reject (SPEC 0006 Q1):** A2 + B1 + C1.

1. Build a **thin menu-bar shell** (A2): tray icon and menu only, no window that renders the
   studio. "Abrir estúdio" opens the local web in the default browser.
2. Build it with **Electron** (B1), as `apps/shell` in the monorepo, TypeScript only, after a
   dependency vetting report (`docs/vetting/0002-shell-runtime.md`) is approved by the owner. No
   `BrowserWindow` loads web content; if a small settings or about window is ever added it loads
   only a bundled local file with `contextIsolation` on, `nodeIntegration` off and `sandbox` on.
3. **The watcher stays a launchd agent, unchanged** (C1). The shell starts and stops only the api
   and web, through the same service manager and pid records as the CLI, and reads the watcher
   heartbeat file and the schedule files for display. It never signals the watcher.
4. D9 is amended to: "launchd manages only the watcher. The web and api start with `studio start`
   or from the menu-bar shell, and stop with `studio stop` or from the shell."
5. The `.app` is built locally by `scripts/install.sh`, ad-hoc signed, optionally registered as a
   login item, and removed by `scripts/uninstall.sh`. No Developer ID, no notarization, no
   auto-update.

Deciding reasons: the shell's real job in R3 is status and start/stop for a studio that now works
on a schedule, and a menu does that; keeping the studio in the browser avoids making us the
maintainer of an embedded browser for an authenticated app; Electron is the only candidate that
does not add a second language; and leaving the watcher under launchd preserves the property that
runs and schedules outlive every interface.

Honest cons of the recommendation: it spends about 200 MB of disk and a permanently resident
process on a menu that a native Swift app would deliver in a fraction of that; it adds Electron's
release cadence to the maintenance list; and it does not make the studio "an app" in the sense of
one window. If the owner values smallness over the one-language rule, B3 (Swift, shelling out to
`studio status --json`) is the better engineering fit and needs only a recorded exception to the
rule. If the owner wants the single window, A3 is the same technology with a larger scope and a
security review of the embedded web view.

## Consequences

Easier:

- After a reboot the web and api can be up without a terminal (login item).
- Watcher state, the next scheduled slot, runs waiting for review and missed slots are visible at
  a glance.
- `studio start`, `studio stop` and the shell agree, because they share the pid records.

Harder:

- A new dependency with an install-time binary download: vetting, pinning and periodic upgrades.
- The service manager lives in `tools/cli/src/services/`; the shell must reuse it (extract to a
  shared package, or invoke the `studio` binary). SPEC 0006 R3-08 decides which.
- `scripts/install.sh` and `scripts/uninstall.sh` grow a build step and a login-item step.
- One more process that reads the data home; it must stay read-only there apart from the pid
  records the service manager already writes.

We commit to maintain: the shell free of secrets and of any network listener; no window loading
remote or authenticated content; no auto-update; the watcher plist unchanged; uninstall removing
the app and its login item.

## Revisit when

- A second Mac or any other user needs the studio: Developer ID signing and notarization become
  mandatory, and a self-contained bundle (Node, ffmpeg, the Prisma engine inside the app) becomes
  the real project. Reopen this ADR together with ADR 0001.
- The idle shell uses more than 300 MB of memory, or its bundle more than 400 MB, measured after
  the first build (**Assumption**): reopen B1 versus B3.
- The owner asks for the studio in its own window: reopen A2 versus A3 with a security review.
- An Electron major used by the shell leaves support and the upgrade is not a version bump: reopen
  B1.
- macOS blocks or warns on the locally built, ad-hoc signed app: reopen section D.
- The shell is unused for a release (the owner keeps using `studio start`): remove it.

## Decision record (R3-08)

Added 2026-11-19 (R3-08 part 2, super-dev run `2026-11-19-r3-outside-signals-3`, tickets 09 to 11;
recorded by ticket 12). It records what was built. The sections above are left as written,
including their **Unverified** marks; where vetting 0002 section 12 confirmed or corrected one of
them, the list at the end of this section says so. Paths are relative to the repository root.

D9, as amended by decision 4 above and recorded here and in the ADR 0001 amendment of 2026-11-19: "launchd manages only the watcher. The web and api start with `studio start` or from the menu-bar shell, and stop with `studio stop` or from the shell."
PRD 0001's D9 row (section 0) and its section 11 row "Web and api" still carry the R1 wording; per
SPEC 0006 L7 the two ADRs are the amending record. Whether the PRD rows are edited is the owner's
call.

### Dependencies (ticket 09)

1. **Three exact pins**, in `apps/shell/package.json` `devDependencies` (lines 14-26): `electron`
   `45.4.1`, `@electron/packager` `20.3.0`, `@electron/fuses` `2.1.3`, with no range character. The
   package has no runtime `dependencies`. The framework version is pinned again where it is
   downloaded: `ELECTRON_VERSION` in `apps/shell/scripts/package-app.mjs:23` and
   `STUDIO_ELECTRON_VERSION` in `scripts/lib/common.sh:23`. `pnpm-lock.yaml` gained additions only:
   38 packages, all inside the trees of vetting section 4, none with an install script (vetting
   section 12, check 2).
2. **No `onlyBuiltDependencies` entry.** `pnpm-workspace.yaml` is unchanged: `apps/*` already
   matches `apps/shell`, and `electron` 45.4.1 has no install script to allow.
3. **esbuild bundle.** `@studio/shared` is a `devDependency` that esbuild inlines into
   `dist/main.js` (`apps/shell/package.json:8`: `--bundle --platform=node --format=cjs
   --external:electron`), so the menu reuses the shared schedule, run and heartbeat code instead of
   a second implementation. `esbuild` is pinned to `0.28.2`, a version the lockfile already held.
4. **Tooling.** `apps/shell/tsconfig.json` extends `@studio/tsconfig/library.json`
   (`rootDir: src`, `outDir: dist`); `tsconfig.build.json` excludes `src/**/*.test.ts`;
   `eslint.config.mjs` re-exports `@studio/eslint-config/base`, not `nest`, because the shell has
   no Nest module.
5. **Read checks.** Phase 2 checks 1, 2, 3, 4 and 6 are recorded in vetting section 12. The
   owner-run checks are listed under "Evidence pending at the final gate (owner-run)" below.

### Tray app (ticket 10, `apps/shell/src`)

6. **Service control by invoking the `studio` binary.** This answers the "Harder" item above that
   left the choice to R3-08: `tools/cli/src/services/**` is untouched and not extracted. "Iniciar"
   and "Parar" spawn `<nodeBinary>` with the argument arrays `[cliMain, 'start']` and
   `[cliMain, 'stop']`, `shell: false`, `stdio: 'ignore'` and not detached
   (`actions/studio-invoker.ts:99-105`, `actions/node-spawner.ts:9-15`). One action runs at a time;
   a child still running after 60 s is shown as "sem resposta" and is never killed
   (`actions/studio-invoker.ts:11-12`). Exit code 0 is success, 5 is "dependency unavailable", any
   other code is a failure (`actions/studio-invoker.ts:7-9`). The CLI's output is neither shown nor
   logged.
7. **Allowlisted child environment** (`actions/child-environment.ts:3-27`): `PATH` (fallback
   `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` when a login item starts with
   none), `HOME`, `TMPDIR` and `LANG` when set, and `VIDEO_STUDIO_HOME`, `VIDEO_STUDIO_WEB_PORT`,
   `VIDEO_STUDIO_API_PORT` from the bundled configuration. No provider key and no `NODE_OPTIONS`.
8. **Provider-mode difference.** `studio start` run from a terminal forwards its caller's provider
   mock/live variables (`VIDEO_STUDIO_<PROVIDER>_MODE`, `VIDEO_STUDIO_<PROVIDER>_MOCK_FAULT`) to the
   api (`tools/cli/src/settings/cli-settings.ts:67-70`). An api started from the shell receives none
   of them and runs with the api's defaults: every provider `mock`
   (`packages/core/src/providers/provider-modes.config.ts:6`). No way to carry them was added.
9. **State model** (`state/state-model.ts:38-79`): watcher `alive` / `dead` / `absent` from
   `logs/watcher.heartbeat.json`, read through the shared reader; fresh within the shared
   `WATCHER_HEARTBEAT_STALE_AFTER_MS` in either direction is `alive`, older, future-dated or
   unreadable is `dead`. Api and web `running` / `stopped` / `unknown` from the pid records of
   `tools/cli/src/services/service-spec.ts:33-35`, read by the shell's own strict reader (at most
   4096 bytes, `state/pid-record.ts:24-25`) plus the shared signal-0 `isProcessAlive`; an invalid
   record is `unknown`.
10. **Polling** (`controller/shell-controller.ts:5-11`): heartbeat and pid records every 5 s;
    schedules and runs every 60 s, once when the menu opens, and after every action. No file
    watcher on the data home.
11. **Menu contents.** The earliest next slot over `active` schedules through the shared
    `nextSlots` and schedule file readers (`state/schedule-summary.ts:1-2`); the count of runs at
    `review` from a bounded directory read (at most 2000 run folders, 2 MiB per `run.json`) parsed
    with the shared `RunFileSchema`, because `@studio/shared/run-files` has no lister and no size
    bound (`state/review-summary.ts:8-18`). Labels are pt-BR (`menu/labels.ts:5-39`): "Iniciar",
    "Parar", "Abrir estúdio", "Abrir ao iniciar sessão", "Sair". "Iniciar" is enabled when api or
    web is not running, "Parar" when either is running or unknown, both only while no action is in
    flight; "Abrir estúdio" only while the web is `running` (`menu/menu-model.ts:83-97`). An
    invalid or missing configuration shows "Instalação incompleta: reinstale o estúdio" and "Sair"
    only (`menu/menu-model.ts:124-131`).
12. **Tray and Dock.** A text-title tray ("Estúdio") with an empty image: the repository has no
    icon asset and none was added (`electron/shell-app.ts:97-99`). The Dock icon is hidden both in
    code (`electron/shell-app.ts:95-96`) and by `LSUIElement` in the packaged `Info.plist`
    (`apps/shell/scripts/package-app.mjs:257`).
13. **One browser hand-off.** `shell.openExternal(studioUrl(config.webPort))` is the only
    `openExternal` call site (`electron/shell-app.ts:62-65`); `studioUrl` returns exactly
    `http://127.0.0.1:<webPort>/` (`actions/studio-url.ts:8-11`).
14. **Security handlers** (`electron/security.ts:10-24`): `app.enableSandbox()` and a
    `web-contents-created` handler that denies window opening and cancels navigation, before
    `ready`; at `ready`, `setPermissionRequestHandler` and `setPermissionCheckHandler` both deny
    (the vetting section 12 correction of section 8 row 6). No window, web view, `autoUpdater` or
    `crashReporter` is used, and no command-line switch is appended anywhere (the section 12
    correction of row 12: no fuse blocks the remote-debugging switch, so its absence is the
    control). A second instance quits (`electron/shell-app.ts:128-132`).
15. **Login item.** The "Abrir ao iniciar sessão" checkbox calls
    `app.setLoginItemSettings({ openAtLogin })` (`electron/login-item.ts:4-10`). The shell does
    not start the services at login: at startup it reads state only, and the services start only
    from "Iniciar". The process accepts one switch, `--unregister-login-item`
    (`cli/shell-arguments.ts:1-12`), which sets open-at-login to false and quits without a tray or
    the single-instance lock (`electron/shell-app.ts:114-126`); the uninstaller uses it.
16. **Baked `shell-config.json`** (`config/shell-config.ts:5-24`, `main.ts:4-6`): `format: 1`,
    `nodeBinary`, `cliMain`, `dataHome`, `webPort`, `apiPort`, written by the package script beside
    `main.js` inside `app.asar`, so the asar integrity fuse covers it. Reason: a login item starts
    with a minimal `PATH` and fuse `RunAsNode` is off, so the app cannot find `node` by name or be
    its own Node. Strict parse: unknown or missing keys, relative or non-normalized paths, ports
    outside 1024-65535 or equal ports, and files over 16 KiB are typed errors. Values never come
    from an environment variable, an argument or a data-home file.
17. **Read-only in the data home.** The shell reads `logs/`, `schedules/` and `runs/`
    (`state/data-home-paths.ts:3-15`) with `O_RDONLY | O_NOFOLLOW` (`state/bounded-file.ts:26-27`)
    and writes no file there, not even a pid record: the `studio` child it spawns writes those, as
    it does from a terminal. It sends no signal to any process.
18. **Diagnostics** (`logging/diagnostics.ts:4-8`): no log file; one JSON line per event to stderr
    with an event id, reason ids, an action, an exit code and counts only (SPEC 0006 K7).

### Packaging, install and uninstall (ticket 11)

19. **Package script** `apps/shell/scripts/package-app.mjs`, run by the installer as
    `pnpm --filter @studio/shell run package -- --node-bin <abs> --cli-main <abs> --data-home <abs>
    --web-port <port> --api-port <port>`. Guards, in order (lines 90-201): refuses root; macOS
    only; refuses to run while any download redirect variable of vetting section 12 is set, in any
    spelling (13 normalized names, lines 45-64); strict arguments; `dist/main.js` present; the
    installed `electron` is 45.4.1 and its embedded `checksums.json` holds a sha-256 for
    `electron-v45.4.1-darwin-arm64.zip`.
20. **Three staged files** (lines 222-234): `main.js`, `shell-config.json` and a minimal
    `package.json` (`name`, `version`, `main`); no `node_modules`, sources or maps. The packager
    runs with `asar: true` and `asarIntegrityDigest: true`.
21. **App identity and download** (lines 23-31, 236-260): name "Video Studio", bundle id
    `com.videostudio.shell`, darwin arm64. The framework download is build-only, done by
    `@electron/packager` from GitHub releases of `electron/electron`
    (`https://github.com/electron/electron/releases/download/`), and is verified against the
    registry-covered embedded `checksums.json` rather than the remote `SHASUMS256.txt`. No
    `install-electron`, no dev binary, no mirror. The zip is cached in `~/Library/Caches/electron/`.
22. **Six fuses, read back** (lines 66-74, 267-277): `RunAsNode`,
    `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` and
    `GrantFileProtocolExtraPrivileges` off; `EnableEmbeddedAsarIntegrityValidation` and
    `OnlyLoadAppFromAsar` on. Each state is read back after flipping, and the script fails on a
    mismatch.
23. **Ad-hoc signing** (lines 284-288): an explicit `codesign --sign - --force --deep` after the
    fuse flip (which invalidates the framework signature; `resetAdHocDarwinSignature` is left
    `false`), then `codesign --verify --deep --strict`. No Developer ID, no notarization.
24. **Install step 12 of 15** (`scripts/install.sh:520-714`), after the `studio` link and before the
    watcher's launchd agent. `--skip-shell` skips it with no download, build or copy. Both the
    `PATH` node and the node the app will spawn must be 22.12 or later. It names the download host
    and asks its own question before the packager runs; `--yes` does not answer it, and without a
    terminal the answer is no. `--dry-run` asks nothing and changes nothing. It removes the 37
    redirect variable spellings of `scripts/lib/common.sh:28-43` from the packager's environment
    and never sets a mirror. Any failure warns, adds a note to the summary and the install goes on.
    Web and api ports are `VIDEO_STUDIO_WEB_PORT` / `VIDEO_STUDIO_API_PORT` when numeric, else 4310
    and 4311.
25. **Rebuild detection** (`scripts/install.sh:585-602`): the stamp
    `apps/shell/out/install-stamp.txt` holds the Electron version, the sha-256 of `dist/main.js`
    and of the package script, and the five baked values; an equal stamp plus a verifying
    installed copy is "sem mudança".
26. **Install location** `~/Applications/Video Studio.app` (`scripts/lib/common.sh:229-236`),
    user-owned, no `sudo`. An existing folder is replaced only when it passes four checks: an
    absolute, normalized path ending in `.app`; under `~/Applications`; a real folder, not a link;
    bundle id `com.videostudio.shell` (`scripts/lib/common.sh:366-400`). A running shell is asked
    to quit first; the copy is made with `ditto` and its signature verified.
27. **Uninstall step 1 of 6** (`scripts/uninstall.sh:68-147`, refusal of root at line 340): when
    the app passes the four checks, it runs the app once with `--unregister-login-item` (15 s
    bounded wait, `TERM` on timeout, never `-9`), asks it to quit through
    `osascript -e 'quit app id "com.videostudio.shell"'` with a 15 s wait (if it is still running,
    nothing is deleted), repeats the four checks and removes the app folder. It removes
    `apps/shell/out/` only when that is a real folder and no shell runs from it. The Electron cache
    `~/Library/Caches/electron` is never deleted: other Electron apps may use it; the script prints
    its path and the command to delete it by hand.
28. **Facts the owner meets.** An `electron_*` entry in the owner's `.npmrc` reaches the package
    script as an `npm_config_electron_*` variable, so `package-app.mjs` refuses and the install step
    is skipped with a note. The first quit through `osascript` may trigger a one-time macOS
    Automation prompt for the terminal (`scripts/lib/common.sh:416-418`).

### Statements of the sections above that vetting 0002 section 12 confirmed or corrected

- B1 cons, "its install script downloads a binary": corrected. `electron` 45.4.1 has no install
  script (section 12, install and check 2). The framework is downloaded only by
  `@electron/packager` at build time (decision 21), or by a plain-Node `require('electron')`,
  which the shell never does (section 12, check 3).
- Section D and the download: the host is confirmed as GitHub releases of `electron/electron`
  (section 12, check 3); the CDN host behind the redirect is still **Unverified**.
- Section 8 of the vetting report, rows 6 and 12: corrected in section 12 ("Corrections to section
  8") and applied in decision 14.
- B1 cons, bundle size (about 200 MB) and idle memory, and section D, Gatekeeper: still
  **Unverified**; they are owner-run measurements under "Evidence pending at the final gate
  (owner-run)" below.
- B1 cons, the support window of "the latest three majors": still **Unverified** (vetting section
  10).

## Acceptance criteria (SPEC 0006 R3-AC-25)

The twelve criteria as written in `docs/specs/r3-outside-signals/tickets/R3-08-graph.md` ("R3-AC-25,
written concretely"), copied verbatim, each with its evidence kind and its ticket. SPEC 0006
section 8 delegates them to R3-08 ("the criteria written in R3-08 once the owner answers Q1").

| AC | Criterion (falsifiable) | Evidence | Ticket |
|---|---|---|---|
| R3-AC-25.1 | `apps/shell/package.json` `devDependencies` holds `electron` `45.4.1`, `@electron/packager` `20.3.0` and `@electron/fuses` `2.1.3` with no range character; it has no runtime `dependencies`; `onlyBuiltDependencies` in `pnpm-workspace.yaml` is unchanged | manifest and diff | 09 |
| R3-AC-25.2 | Every package the lockfile gained is inside the trees of vetting section 4, none has a `preinstall`, `install` or `postinstall` script, and the results of phase 2 checks 1, 2, 3, 4 and 6 are recorded in vetting section 12 | lockfile read, report | 09 |
| R3-AC-25.3 | From a heartbeat that is fresh, stale, absent or invalid, and pid records that are valid-and-alive, valid-and-dead, absent or invalid, the shell's state model reports watcher `alive` / `dead` / `absent` and api and web `running` / `stopped` / `unknown` as specified in ticket 10 | unit tests | 10 |
| R3-AC-25.4 | The menu has items labelled exactly "Iniciar", "Parar" and "Abrir estúdio", shows the earliest next slot over `active` schedules (or that there is none) and the count of runs at `review`; "Abrir estúdio" is enabled only while the web is `running` | unit tests | 10 |
| R3-AC-25.5 | "Iniciar" and "Parar" run the configured Node binary with the argument arrays `[cliMain, 'start']` and `[cliMain, 'stop']`, no shell and an allowlisted environment; the shell sends no signal to any process and writes no file in the data home | unit tests, grep | 10 |
| R3-AC-25.6 | The watcher is not controlled by the shell and its launchd plist template is unchanged; `tools/cli/src/services/**` is unchanged | diff, grep | 10, 11 |
| R3-AC-25.7 | The only URL the shell hands to the browser is `http://127.0.0.1:<web port>/`, built from the bundled configuration, at a single `openExternal` call site | unit test, grep | 10 |
| R3-AC-25.8 | `apps/shell/src` creates no `BrowserWindow` or web view, imports no `autoUpdater` or `crashReporter`, opens no listener and makes no outbound request; permission requests, navigation and window opening are denied; a second instance quits | grep, inspection | 10 |
| R3-AC-25.9 | The package script sets fuses `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` and `GrantFileProtocolExtraPrivileges` off and `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` on, then signs ad hoc and verifies; the packaged app contains `main.js`, `shell-config.json` and a minimal `package.json` and no `node_modules` | inspection | 11 |
| R3-AC-25.10 | `scripts/install.sh` names the download host and asks before the packager runs, never sets a mirror, refuses to run as root, skips with `--skip-shell`, changes nothing with `--dry-run` and continues the install when the step fails; `scripts/uninstall.sh` refuses root, unregisters the login item and removes only the app it identifies by bundle id | `bash -n`, `--dry-run` output, inspection | 11 |
| R3-AC-25.11 | ADR 0001 carries an append-only amendment for the processes decision and its fired revisit trigger; ADR 0005 carries the decision record, these criteria and the amended D9 sentence verbatim; SPEC 0006 and PRD 0001 are unchanged | diff | 12 |
| R3-AC-25.12 | On the owner's Mac after the first build: no TCP or UDP socket on the shell's processes; no outbound connection in 10 minutes idle and one start/stop cycle; the six fuse states read back as in 25.9; the signature is ad hoc; the bundle is under 400 MB and idle resident memory under 300 MB (ADR 0005 revisit triggers, measured); macOS opens the app without a Gatekeeper prompt | owner-run, phase 2 checks 5, 7, 8 | final gate |

R3-AC-25.12 is pending evidence until the owner has run the checks below; it is never reported as
met before that.

Known limitation (owner decision of 2026-11-19, "Document the limit"): install step 5
(`turbo run build`, unchanged) builds every workspace package, `@studio/shell` included. A failure
of the shell's esbuild bundle therefore stops the whole install even with `--skip-shell`, which
only governs step 12. R3-AC-25.10 is still met as written. Revisit trigger: a shell bundle failure
that blocks an install, or a request to install without the shell's sources.

## Evidence pending at the final gate (owner-run)

Status: **pending**. Nothing in this section has been run. The owner runs these on the Mac after
the first `scripts/install.sh` run that builds the app (step 12, answering "s" to its download
question). Per the owner's decision of 2026-11-19 (`R3-08-graph.md`, "Owner decisions on the open
questions"), the measured results are appended by the supervisor to
`docs/vetting/0002-shell-runtime.md` section 12, not to this ADR.

| Phase 2 check (vetting section 11) | What the owner runs and records | Revisit trigger it measures |
|---|---|---|
| 5 | The explicit download step, once: `scripts/install.sh` step 12. Record the final host names (the CDN host behind GitHub's redirect is still **Unverified**), the framework zip size in `~/Library/Caches/electron/` and the size of the built app (`package-app.mjs` prints `tamanho: <bytes>`; `du -sk "$HOME/Applications/Video Studio.app"` reads the installed copy) | Bundle over 400 MB: reopen B1 versus B3 |
| 7 | `lsof -nP -a -p <shell pids> -i` shows no TCP or UDP socket; 10 minutes idle and one "Iniciar" / "Parar" cycle show no outbound connection; `npx @electron/fuses read --app "$HOME/Applications/Video Studio.app"` shows the six fuse states of R3-AC-25.9; `codesign -dv "$HOME/Applications/Video Studio.app"` shows an ad-hoc signature; idle resident memory of all shell processes (for example `ps -axo pid,rss,comm` filtered on `Video Studio.app`, summed) | Idle memory over 300 MB: reopen B1 versus B3 |
| 8 | Open the locally built, ad-hoc signed app (`open "$HOME/Applications/Video Studio.app"`) and confirm macOS shows no Gatekeeper prompt | A block or warning: reopen section D |

The `du` and `ps` forms are suggestions for reading the values; the checks themselves are those of
vetting section 11 and `R3-08-graph.md`.
