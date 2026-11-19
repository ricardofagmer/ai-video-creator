# 0005. Add a thin menu-bar shell that controls the api and web, and keep the watcher under launchd

Date: 2026-11-19
Status: proposed; the owner chose A2 + B1 + C1 (thin Electron menu-bar shell, watcher stays under launchd) on 2026-11-19 (SPEC 0006 Q1, "Electron menu-bar (Recommended)"). Acceptance follows review, as for ADRs 0001-0004.

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
