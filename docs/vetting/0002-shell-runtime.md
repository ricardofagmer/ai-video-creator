# Vetting 0002: menu-bar shell runtime and packager (SPEC 0006 R3-08, ADR 0005)

Date: 2026-11-19. Author: backend-coordinator (R3-08 part 1, ticket `07-shell-runtime-vetting`).
Status: **approved, option P** (owner, 2026-11-19: "Approve option P (Recommended)"). Phase 2 checks (section 11) still to run, each with its own owner approval.

Sources: `npm view` read-only registry lookups made on 2026-11-19 (results quoted below), SPEC 0006
section 9 R3-08 and section 15 (Q1 answer: "Electron menu-bar (Recommended)"), ADR 0005, ADR 0001,
`pnpm-workspace.yaml`. Nothing was installed, packed or downloaded, and no tarball, binary, release
page or upstream web page was opened. So:

- **Registry** marks a value read from the npm registry on 2026-11-19. The registry's
  `maintainers`, `repository`, `license` and `scripts` fields are publisher-supplied claims; only
  the `dist` integrity, signatures and provenance attestations are registry-generated.
- **Unverified** marks a statement from general knowledge, or one that needs the installed files,
  the upstream repository or the release host. Each one has a phase 2 check (section 11).
- **To measure** marks a number ADR 0005's revisit triggers need measured on the owner's Mac.

Dependency trees were resolved by walking each package's `dependencies` and
`optionalDependencies` and taking the highest registry version inside each range. The lockfile may
dedupe differently; the exact tree comes only from the lockfile in phase 2.

## 1. Summary

| Question | Answer |
|---|---|
| Runtime package | `electron` **45.4.1** (latest, 2026-11-19T02:04:13Z), MIT (**Registry**) |
| Packager | `@electron/packager` **20.3.0** (latest, 2026-08-11), BSD-2-Clause, plus `@electron/fuses` **2.1.3** (2026-06-29), MIT, to lock the runtime's dangerous switches (**Registry**). Recommended over `electron-builder` 26.18.0 (section 9) |
| Lifecycle scripts in the proposed tree | **None.** No `preinstall`, `install` or `postinstall` in any of the 53 packages of the three trees. `electron` itself dropped its `postinstall: node install.js` at 42.0.0 (present in 41.10.7, absent from 42.0.0 to 45.4.1) (**Registry**) |
| `onlyBuiltDependencies` entry needed | Proposed: **none** (section 6). The binary is fetched by an explicit, visible step instead of an install script |
| Native binaries | The Electron framework for darwin-arm64 (downloaded, not in the npm tarball); a napi-rs prebuilt in `@electron-internal/extract-zip` (inside its tarball) (**Registry** for where; file names **Unverified**) |
| Download host | `https://github.com/electron/electron/releases/download/v45.4.1/electron-v45.4.1-darwin-arm64.zip` and that release's `SHASUMS256.txt`, through `@electron/get` 5.1.0, with redirects to GitHub's release-asset CDN (**Unverified** URL shape and CDN host names) |
| Install footprint | npm side about 29.8 MB unpacked for electron + packager + fuses (53 packages, **Registry** sizes, summed); the Electron framework itself about 200 to 280 MB (**Unverified**, **To measure**) |
| Advisories | None readable from registry fields; no package in the proposed tree is marked `deprecated` (**Registry**). Advisory database check is phase 2 check 6 |
| Remote switches | Auto-update, crash reporter upload, remote content, permission prompts, Node-in-renderer, `ELECTRON_RUN_AS_NODE` and the inspector: each off by code or fuse (section 8). Electron ships no telemetry (**Unverified**) |
| Recommendation | Approve **electron 45.4.1 + @electron/packager 20.3.0 + @electron/fuses 2.1.3**, exact pins, as `devDependencies` of `apps/shell`, no `onlyBuiltDependencies` entry |

## 2. Package identity and publisher

### `electron`

| Field | Value |
|---|---|
| Name | `electron` (unscoped; created 2012-05-18) |
| Proposed | **45.4.1**, published 2026-11-19T02:04:13Z; dist-tag `latest` (**Registry**) |
| Release line | 45.0.0 (2026-10-21), 45.1.0 (2026-10-27), 45.2.0 to 45.2.3, 45.3.0 to 45.3.4 (2026-11-17), 45.4.1. There is no 45.4.0 in the registry's `time` map (**Registry**; never published or removed, **Unverified** which) |
| Other active lines | 43.8.12 (2026-11-19T00:11Z), 44.11.5 (2026-11-19T00:45Z), 45.4.1 (02:04Z) were all published the same day; the 42 line's last release, 42.11.18, came on 2026-10-21, the day 45.0.0 shipped. That fits a policy of "latest three majors supported" (**Registry** dates; the policy is **Unverified**). Next: `alpha` 46.0.0-alpha.11 (2026-11-17), `beta` 45.0.0-beta.7 |
| Maintainers | `electronhq` (marshallofsound+electronhqnpm@electronjs.org), `electron-nightly` (info+nightly-npm@electronjs.org); 45.4.1 was published by `electron-nightly`, the release automation account (**Registry**, identities **Unverified**) |
| Repository field | `git+https://github.com/electron/electron.git`; homepage the same repository |
| Registry signature | `dist.signatures` present (npm ECDSA key `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`) |
| Provenance attestation | **None** on `electron` 45.4.1 (`dist.attestations` absent) |
| Tarball | `electron-45.4.1.tgz`, integrity `sha512-DjsJ/eQhovkjf1vYFFyh5GB8NMx+L5bdYaonvGOlWselg3DQ0fwIF0N/+2hrPsoS4whmmNswh21ym/8dgt1y5Q==`, 9 files, 1,215,897 bytes unpacked |
| Entry points | `main: index.js`, `types: electron.d.ts`; `bin`: `electron` -> `cli.js`, `install-electron` -> `install.js` |
| Engines | `node >= 22.12.0` (the repository declares `>=22`; the owner's Node must be at least 22.12) |
| Upstream install command | **Unverified.** Direction-of-trust rule (`supermatt:dependency-vetting`): the owner or phase 2 opens `electronjs.org/docs` or the GitHub README and confirms it publishes `npm install electron --save-dev` and, for 42+, how the binary is fetched (`install-electron` or first run) |

### `@electron/packager` and `@electron/fuses`

| Field | `@electron/packager` | `@electron/fuses` |
|---|---|---|
| Proposed | **20.3.0**, 2026-08-11T20:24:53Z, `latest` | **2.1.3**, 2026-06-29T18:04:19Z, `latest` |
| Package created | 2023-11-03 (the scoped successor of `electron-packager`, **Unverified** lineage) | 2021-04-23 |
| Maintainers | `electron-cfa` (info+cfa-npm@electronjs.org) | `electron-cfa` |
| Published by | GitHub Actions OIDC (`npm-oidc-no-reply@github.com`) | **Unverified** (`_npmUser` not read) |
| Repository field | `git+https://github.com/electron/packager.git` | `git+https://github.com/electron/fuses.git` |
| Provenance attestation | present | present |
| Unpacked | 282,000 bytes | 40,898 bytes, no dependencies, `bin: electron-fuses` |
| Engines | `node >= 22.12.0` | `node >= 22.12.0` |

The three packages share the Electron organisation's npm accounts and GitHub organisation. 15 of
the 53 packages in the combined tree carry provenance attestations (all `@electron/*` packages
except `electron` itself, plus `undici`, `semver`, `glob`, `minimatch`, `graceful-fs`,
`undici-types`); the other 38, including `electron`, carry only the registry signature (**Registry**).

## 3. Licences

| Package | Licence (**Registry**) | Note |
|---|---|---|
| `electron` | MIT | The downloaded framework bundles Chromium, Node and their third-party licences (a `LICENSES.chromium.html` file, **Unverified**). Used locally, never redistributed: no notice obligation arises for one owner on one Mac |
| `@electron/packager`, `@electron/osx-sign`, `@electron/windows-sign` | BSD-2-Clause | |
| `@electron/fuses`, `@electron/get`, `@electron/asar`, `@electron/universal`, `@electron/notarize`, `@electron-internal/extract-zip` | MIT | |
| `sumchecker`, `@malept/cross-spawn-promise` | Apache-2.0 | |
| `graceful-fs`, `glob`, `minimatch`, `lru-cache`, `path-scurry`, `minipass`, `@isaacs/nonrecursive-glob-match` | BlueOak-1.0.0 | Permissive |
| the remaining packages | MIT, ISC | Whole tree: 37 MIT, 7 BlueOak-1.0.0, 4 ISC, 3 BSD-2-Clause, 2 Apache-2.0 |

No copyleft licence anywhere in the proposed tree (compare libvips' LGPL in vetting 0001).

## 4. Dependencies, lifecycle scripts and size

### `electron` 45.4.1 tree (13 packages, 13,657,982 bytes unpacked, the framework excluded)

| Package | Range | Resolved today | Install scripts | Unpacked | Note |
|---|---|---|---|---|---|
| `@electron/get` | `^5.0.0` | 5.1.0 (2026-07-27) | none (`prepare: husky` only, which does not run for registry installs) | 71,665 B | The downloader. Deps `debug`, `semver`, `progress`, `env-paths ^3`, `sumchecker` (SHASUMS256 verification), `graceful-fs`; optional `undici ^7.24.4` |
| `@electron-internal/extract-zip` | `^1.0.1` | 1.0.8 (2026-10-29) | none | 7,493,815 B | "Fast, safe, native zip extraction"; built with `napi build`, so its 16 files include prebuilt `.node` addons for several platforms (**Unverified** file list). No dependencies. Replaced `extract-zip` at 43.0.0 |
| `@types/node` | `^24.9.0` | 24.19.2 | none | 2,613,701 B | Typings only; dep `undici-types` 7.24.6 |
| `undici` | `^7.24.4` (optional, via `@electron/get`) | 7.30.2 | none (`prepare` only) | 1,693,130 B | HTTP client and proxy support for the download (**Unverified** role) |
| `sumchecker`, `semver`, `debug`, `ms`, `progress`, `env-paths`, `graceful-fs`, `undici-types` | | | none | about 570 KB together | |

### `@electron/packager` 20.3.0 tree (49 packages, 25,785,690 bytes unpacked)

Direct dependencies (**Registry**): `@electron/get ^5.0.0`, `@electron-internal/extract-zip
^1.0.1`, `@electron/asar ^4.0.1` (4.3.2), `@electron/osx-sign ^2.2.0` (2.7.2),
`@electron/notarize ^3.1.0` (3.1.2), `@electron/universal ^3.0.1` (3.0.6),
`@electron/windows-sign ^2.0.2` (2.1.0), `@malept/cross-spawn-promise ^2.0.0`, `galactus`, `junk`,
`plist`, `resedit`, `filenamify`, `graceful-fs`, `semver`, `debug`, `yargs-parser`. The largest
transitive ones: `postject` 1.0.0-alpha.6 (4.9 MB, via `@electron/windows-sign`; Windows only, idle
on macOS), `lru-cache` (3.3 MB), `glob` 14 (1.9 MB), `plist` (1.0 MB).

### `@electron/fuses` 2.1.3 (1 package, 40,898 bytes, no dependencies)

### Lifecycle scripts found across the proposed tree (**Registry**, by range resolution)

| Package | `preinstall` / `install` / `postinstall` | `prepare` (does not run for registry tarballs) |
|---|---|---|
| all 53 packages | **none** | `@electron/get`, `@electron/asar`, `@electron/notarize`, `@electron/osx-sign`, `@electron/universal`, `galactus`, `@electron/packager` (`husky`); `@electron/windows-sign` (`husky install`); `@malept/cross-spawn-promise` (`husky install && yarn build`); `yargs-parser` (`npm run compile`); `undici` (`husky && node ./scripts/platform-shell.js`) |

`electron` before 42.0.0 carried `postinstall: node install.js` (read for 35.0.0, 38.0.0, 40.0.0,
41.0.0 and 41.10.7). From 42.0.0 the script is gone and `install.js` is exposed as the
`install-electron` bin instead (**Registry**). The brief's premise that Electron's postinstall
downloads the binary holds only for 41 and older; why it changed, and whether `cli.js` also
downloads on first run when the binary is missing, is **Unverified** (phase 2 check 3).

Combined footprint (electron + packager + fuses, deduplicated): 53 packages, 29,772,732 bytes
unpacked in `node_modules`, plus the downloaded framework (section 5). This is disk on the owner's
Mac at build time; the built `.app` contains only the framework and the shell's own code.

## 5. Native binaries and download hosts

| Binary | Where it comes from | When | Verification |
|---|---|---|---|
| Electron framework, darwin-arm64 (`Electron.app`: Chromium, Node, V8, Crashpad handler) | `https://github.com/electron/electron/releases/download/v45.4.1/electron-v45.4.1-darwin-arm64.zip`, redirected to GitHub's release-asset CDN (today under `*.githubusercontent.com`) (**Unverified**) | Only when a step asks for it: `install-electron` (the bin), `@electron/packager` at build time (it downloads its own copy through `@electron/get`), and possibly `electron` on first run (**Unverified**) | `@electron/get` checks the zip against the release's `SHASUMS256.txt` with `sumchecker` (**Unverified** that it is on by default in 5.x). Both files come from the same host, so this catches corruption, not a compromised release; the registry integrity of `electron` does not cover the zip |
| Download cache | `env-paths` cache directory, on macOS `~/Library/Caches/electron/` (**Unverified**) | Reused by both the dev binary and the packager | Cached zips are re-checked against `SHASUMS256.txt` (**Unverified**) |
| `@electron-internal/extract-zip` `.node` addons | Inside the npm tarball (no download, no install script) | At install | Registry integrity and signature cover them (**Registry**: no scripts, no `gypfile`) |
| Size of the framework zip and of the extracted `Electron.app` | | | **To measure** (ADR 0005 says about 200 MB on disk; its revisit trigger is a 400 MB bundle) |

Environment variables that redirect or skip the download (`ELECTRON_MIRROR`,
`ELECTRON_CUSTOM_DIR`, `electron_config_cache`, `ELECTRON_SKIP_BINARY_DOWNLOAD`) are known from the
1.x to 4.x era of `@electron/get` and earlier Electron; their names and effect in 5.1.0 and
45.4.1 are **Unverified**. The install script must not set a mirror: GitHub releases of
`electron/electron` are the only host proposed.

## 6. pnpm 10 and `onlyBuiltDependencies`

pnpm 10 runs no dependency lifecycle script unless the package is listed in
`onlyBuiltDependencies`. It still links every `bin` (**Unverified** in detail; consistent with how
this repository already treats `onnxruntime-node`).

- With `electron` 45.4.1 there is **no script to block**, so pnpm installs the npm package and the
  `electron` and `install-electron` bins, and fetches no binary. An `onlyBuiltDependencies` entry
  would do nothing and is **not proposed**. The current list (`esbuild`, `prisma`,
  `@prisma/client`, `@prisma/engines`, `playwright`) stays unchanged, so ADR 0001's revisit trigger
  ("more than 2 dependencies ... beyond esbuild, Prisma and Playwright") does not fire.
- Had a 41.x or older version been chosen, its `postinstall` would be blocked by pnpm 10 and the
  binary would be missing until `electron` were added to `onlyBuiltDependencies`. That is one more
  reason to stay on 42+.
- The binary is instead fetched by **one explicit step** in `scripts/install.sh` (R3-08 part 2),
  printed before it runs, with the host named. Two shapes, decided in R3-08:
  1. Build only: `@electron/packager` downloads the zip once into the cache and assembles the
     `.app`; the `node_modules` copy of the framework is never fetched. Fewer bytes, no dev binary.
  2. Build and dev: `pnpm --filter <shell package> exec install-electron` first, then the packager
     reuses the cached zip (**Unverified** that both read the same cache).
- No package in the proposed tree runs code at install. The first code from these packages that
  runs is the explicit download step, and then the packager.

## 7. Known advisories

| Source | Result |
|---|---|
| Registry `deprecated` field | None set on any of the 53 packages in the proposed tree (**Registry**) |
| `electron-builder` tree, for contrast | `glob` 7.2.3 and `inflight` 1.0.6 (via `@electron/asar` 3.4.1) and `boolean` 3.2.0 (via `global-agent` 3.0.0) are marked deprecated; `glob` 7's notice cites "widely publicized security vulnerabilities" (**Registry**) |
| Advisory database (`pnpm audit`, GitHub advisories for `electron`) | **Unverified**: `npm view` exposes no advisory field and `npm audit` needs a lockfile, which this ticket may not create. Phase 2 check 6 |
| Electron's own security fixes | Electron patch releases carry Chromium and Node security fixes, so the shell must follow the latest patch of a supported major (**Unverified** policy). 45.4.1 is the newest patch of the newest stable line today |

Release age: 45.4.1 is under one day old at the time of writing. The previous patch, 45.3.4
(2026-11-17), is the fallback if phase 2 finds a regression; pinning an older patch to wait out
a "cool-off" would trade a known Chromium fix for nothing measurable, so it is not proposed.

## 8. Remote switches, and how the shell stays loopback-only

The shell (ADR 0005 decision 1 and 2) is a tray icon and a menu. It has no `BrowserWindow`, opens
no listener and makes no outbound request. Option and API names are those of recent Electron
majors and must be re-read in the installed 45.4.1 `electron.d.ts` (**Unverified**, phase 2 check 4).

| # | Switch | Default | Shell setting | Why |
|---|---|---|---|---|
| 1 | `autoUpdater` (built-in module) | inert until `setFeedURL` and `checkForUpdates` are called | never imported; no `update-electron-app` or `electron-updater` dependency | PRD 12 and ADR 0005 D: no auto-update channel |
| 2 | Packager update feed | `@electron/packager` writes no update metadata (**Unverified**) | nothing to set; `electron-builder`'s `publish` and `app-update.yml` are avoided by not using it (section 9) | |
| 3 | `crashReporter` | not started; no upload without `start({ submitURL })` (**Unverified**) | never started; if a local crash dump is ever wanted, `start({ uploadToServer: false })` only | No crash data leaves the Mac |
| 4 | Remote content | none without a window | no `BrowserWindow`, no `WebContentsView`; a future settings window loads only a bundled file with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (ADR 0005) | The shell never renders the studio or any URL |
| 5 | Navigation and pop-ups | allowed | `app.on('web-contents-created')` sets `setWindowOpenHandler` to deny and cancels `will-navigate`; `app.enableSandbox()` before `ready` | Defence in depth if a window is ever added |
| 6 | Permission requests (camera, notifications, geolocation) | prompt or grant | `session.defaultSession.setPermissionRequestHandler` denies all | |
| 7 | `shell.openExternal` | any URL | only the exact local web origin `http://127.0.0.1:<web port>/`, built from the service spec, never from file content | "Abrir estúdio" is the one browser hand-off |
| 8 | Fuse `RunAsNode` (`ELECTRON_RUN_AS_NODE`) | enabled | **off** via `@electron/fuses` after packaging | Otherwise the ad-hoc signed app is a general Node interpreter for any local process |
| 9 | Fuses `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` | enabled | **off** | No `NODE_OPTIONS` injection, no `--inspect` debugger port |
| 10 | Fuses `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar` | off | **on** | The app loads only its packed, hashed `app.asar` |
| 11 | Fuse `GrantFileProtocolExtraPrivileges` | enabled | **off** | No window uses `file://` privileges |
| 12 | Remote debugging (`--remote-debugging-port`) | off | never appended; rejected by fuse 9 | Would be a TCP listener |
| 13 | Telemetry | Electron sends none and includes no Google services, Safe Browsing or component updater (**Unverified**) | no analytics dependency in `apps/shell` | PRD 12 |
| 14 | Spell-check dictionary download | Chromium may fetch Hunspell dictionaries on some platforms, not on macOS (**Unverified**) | no window, so no spell checker; `setSpellCheckerEnabled(false)` if a window is added | |
| 15 | `requestSingleInstanceLock` | a local socket or lock file, not a TCP listener (**Unverified** on macOS) | used, to keep one tray icon | Local IPC only |

How it stays loopback-only:

- State comes from files the services already write: `logs/watcher.heartbeat.json`, the pid
  records of `tools/cli/src/services/service-spec.ts:33-35`, the schedule files and the run files
  (R3-08). No HTTP call is needed for the menu; if R3-08 chooses to call the api, it calls only
  `127.0.0.1` with the existing session rules, and never another host.
- The shell creates no `http`, `net` or WebSocket server.
- Phase 2 check 7 proves it on the owner's Mac: no TCP or UDP socket on the shell's processes, and
  no outbound connection during 10 minutes idle and one start/stop cycle.

## 9. Packaging options

| | Option P: `@electron/packager` 20.3.0 + `@electron/fuses` 2.1.3 | Option B: `electron-builder` 26.18.0 | Option F: `@electron-forge/cli` 8.0.1 |
|---|---|---|---|
| Publisher | Electron organisation (`electron-cfa`), provenance attested | `electron-userland` (`stefanjudis`, `develar`, `onegoldfishh`), provenance attested on the CLI | Electron organisation (`malept`, `marshallofsound`, others) |
| Licence | BSD-2-Clause, MIT | MIT | MIT |
| Packages / unpacked | 50 / about 25.8 MB (29.8 MB with `electron`) | 258 / about 37.4 MB | wraps packager plus makers and a CLI framework (tree not walked) |
| Install scripts | none | none in the tree (**Registry**), but it brings `node-gyp` 12.4.0 through `@electron/rebuild` to compile native modules at build time | not walked |
| Deprecated packages | none | `glob` 7.2.3, `inflight` 1.0.6, `boolean` 3.2.0 | not walked |
| Second copies | none | an older `@electron/get` 3.1.0 with `got` 11 and `global-agent` 3, `@electron/osx-sign` 1.3.3, `@electron/universal` 2.0.3, `@electron/asar` 3.4.1, `@electron/notarize` 2.5.0 | |
| Remote features to switch off | none built in | `electron-publish` and update metadata (`publish` must be `null`); `simple-update-notifier` in the CLI, which checks the registry for a newer builder (**Unverified** behaviour); downloads of extra build tools at build time (**Unverified**) | publishers are separate packages, absent unless added |
| Output | an `.app` folder; ad-hoc signing through `osxSign` or a separate `codesign --sign -` | `.app`, DMG, zip and installers; fuses built in through `@electron/fuses` 1.8.0 | `.app` plus makers |
| Fit for "built locally, never distributed" (ADR 0005 D) | exact: an `.app` is all `scripts/install.sh` needs | most of its weight (installers, signing for other machines, publishing, auto-update) is out of scope | a scaffolding and build framework around option P |

Recommendation: **option P**. It is the smallest tree, all from the Electron organisation, with no
deprecated package, no update channel to remember to disable and no native compiler; the one
feature `electron-builder` adds that we need, fuses, is a 41 KB dependency-free package from the
same organisation. The cost is a short build script of our own (packager, fuses, ad-hoc sign)
instead of a declarative config file. Option F is reasonable but adds a framework for a one-screen
tray app.

Packaging note for pnpm (**Unverified**, decided in R3-08): the packager copies the app folder
including its `node_modules`, and pnpm's symlinked layout is a known source of trouble there. The
simplest route is that the shell's main process has no runtime npm dependency (only `electron`
and Node built-ins, invoking the `studio` binary or bundling a small shared module), so the
packaged `app.asar` holds compiled files only. If bundling is needed, `esbuild` is already in
`onlyBuiltDependencies`.

## 10. Proposed exact versions

| Package | Version | Released | Where | Pin |
|---|---|---|---|---|
| `electron` | 45.4.1 | 2026-11-19 | `apps/shell` `devDependencies` | exact (`45.4.1`, no caret); the framework version is tied to the npm version |
| `@electron/packager` | 20.3.0 | 2026-08-11 | `apps/shell` `devDependencies` | exact |
| `@electron/fuses` | 2.1.3 | 2026-06-29 | `apps/shell` `devDependencies` | exact |

Upgrade policy proposed for ADR 0005's maintenance list: follow the latest patch of the shell's
major; move majors before the one in use leaves the supported window (today 43 to 45,
**Unverified** policy); every upgrade re-reads section 4 for new lifecycle scripts.

## 11. Phase 2 checks on the owner's Mac (before the dependency lands)

1. Confirm the upstream install commands and repositories from the projects' own docs
   (`electronjs.org`, `github.com/electron/packager`, `github.com/electron/fuses`), per the
   direction-of-trust rule.
2. `pnpm add -D --save-exact` of the three versions in `apps/shell`, then `npm audit signatures`
   and a read of the lockfile; compare the resolved tree with section 4 and stop on any new
   lifecycle script or any package outside it.
3. Read the installed `electron/install.js`, `cli.js` and `index.js` once: record whether first run
   downloads the framework, which host and environment variables `@electron/get` 5.1.0 uses, and
   that `SHASUMS256.txt` verification is on.
4. Read the installed `electron.d.ts` and confirm every API and option name in section 8, and the
   fuse names in `@electron/fuses` 2.1.3.
5. Run the explicit download step once, with the owner's approval, and record the final host
   names, the zip size and the extracted `Electron.app` size (ADR 0005 trigger: 400 MB).
6. `pnpm audit --prod` and `pnpm audit` over the new lockfile entries, and a read of the GitHub
   advisory list for `electron` 45; record the result here.
7. After the first build: `lsof -nP -a -p <shell pids> -i` shows no socket; 10 minutes idle and
   one start/stop cycle show no outbound connection; `npx @electron/fuses read --app <path>` shows
   the fuse states of section 8; `codesign -dv` shows an ad-hoc signature; idle resident memory of
   all shell processes (ADR 0005 trigger: 300 MB) is **To measure**.
8. Confirm macOS opens the locally built, ad-hoc signed app without a Gatekeeper prompt (ADR 0005
   section D).

## Owner decision needed: approve / reject

Approve `electron` **45.4.1**, `@electron/packager` **20.3.0** and `@electron/fuses` **2.1.3**
(option P, recommended), exact pins in `apps/shell` `devDependencies`, no `onlyBuiltDependencies`
entry, and the framework fetched by one explicit step from GitHub releases of `electron/electron`.
Choosing option B instead means `electron-builder` 26.18.0 with `publish: null` and its larger
tree. Rejecting both returns R3-08 `BLOCKED` and reopens ADR 0005 B1 versus B3 (native Swift).

## Owner decision

2026-11-19, Ricardo Fagmer: **approved option P**: `electron` 45.4.1, `@electron/packager` 20.3.0, `@electron/fuses` 2.1.3, exact pins in `apps/shell` `devDependencies`, no `onlyBuiltDependencies` entry, framework fetched by one explicit step from GitHub releases of `electron/electron`. Nothing installed or downloaded by this decision; phase 2 checks each need their own approval.

## 12. Phase 2 results (ticket 09-shell-dependencies)

Date: 2026-11-19. Author: backend-coordinator (super-dev run `2026-11-19-r3-outside-signals-3`, ticket
`09-shell-dependencies`). Owner approvals used: the install command, the protected paths
`apps/shell/package.json` and `pnpm-lock.yaml`, and the read-only network reads of checks 1, 2 and 6,
all recorded at the super-dev review. Sections 1 to 11 above are unchanged.

Install, run once from the repository root with pnpm 10.12.1:
`pnpm add -D --save-exact electron@45.4.1 @electron/packager@20.3.0 @electron/fuses@2.1.3 --filter @studio/shell`,
exit 0, "Done in 3.6s". The output named no build script, no "Ignored build scripts" notice and no
download; `node_modules/.modules.yaml` holds `pendingBuilds: []`. `electron` 45.4.1 as installed has
no `scripts` field at all, so pnpm had nothing to block (section 4 and section 6 predicted this).
`~/Library/Caches/electron` did not exist before or after, and `node_modules/electron` holds no
`dist` folder and no `path.txt`: the framework was not downloaded. `install-electron` and `electron`
were not run.

### Check 1: upstream install commands and repositories (result: pass)

| Source read on 2026-11-19 | Observed |
|---|---|
| `https://www.electronjs.org/docs/latest/tutorial/installation` (HTTP 200) | Publishes `npm install electron --save-dev`. "Binary download step": the binary "is downloaded by default the first time you run Electron in development mode", or on demand with `npx install-electron --no` |
| `https://github.com/electron/packager` (HTTP 200) | README publishes `npm install --save-dev @electron/packager` and `npx @electron/packager` |
| `https://github.com/electron/fuses` (HTTP 200) | README imports `flipFuses`, `FuseVersion`, `FuseV1Options` from `@electron/fuses`; CLI `npx @electron/fuses read --app` and `write --app` |
| `npm view <pkg>@<version> repository.url dist.integrity --json` | `electron` 45.4.1: `git+https://github.com/electron/electron.git`; `@electron/packager` 20.3.0: `git+https://github.com/electron/packager.git`; `@electron/fuses` 2.1.3: `git+https://github.com/electron/fuses.git`. The three integrities equal the `resolution.integrity` entries in `pnpm-lock.yaml`; the `electron` integrity equals section 2 |

Package names and repositories match section 2. No stop condition.

### Check 2: signatures, lockfile and lifecycle scripts (result: pass)

- `npm audit signatures`, run once in `apps/shell`: exit 0, "audited 839 packages", "839 packages have
  verified registry signatures", "202 packages have verified attestations". npm walked the whole
  workspace tree, which contains the 53 packages below; no invalid or missing signature was reported.
- Lockfile diff: additions only (370 added lines, 0 removed). One new importer, `apps/shell`; its three
  Electron specifiers and resolved versions are `45.4.1`, `20.3.0` and `2.1.3`. `esbuild` resolves to
  the existing `0.28.2`; no new `esbuild` or `@esbuild/*` package version entered the lockfile.
- `requiresBuild` appears 0 times in the lockfile. The dependency closure of the three roots, walked
  over the lockfile snapshots, is **53 packages**, the same count as section 4. Every package in it was
  read from its installed `package.json`: none has a `preinstall`, `install` or `postinstall` script,
  and none has a `binding.gyp` or `gypfile`.
- Packages the lockfile gained (38 new `packages` entries, all inside the section 4 trees; 21 new
  `snapshots` entries for the same packages):
  `@electron-internal/extract-zip@1.0.8`, `@electron/asar@4.3.2`, `@electron/fuses@2.1.3`,
  `@electron/get@5.1.0`, `@electron/notarize@3.1.2`, `@electron/osx-sign@2.7.2`,
  `@electron/packager@20.3.0`, `@electron/universal@3.0.6`, `@electron/windows-sign@2.1.0`,
  `@malept/cross-spawn-promise@2.0.0`, `@types/node@24.19.2`, `@xmldom/xmldom@0.9.12`,
  `base64-js@1.5.1`, `commander@9.5.0`, `electron@45.4.1`, `env-paths@3.0.0`, `err-code@2.0.3`,
  `filename-reserved-regex@3.0.0`, `filenamify@6.0.0`, `flora-colossus@3.0.2`, `galactus@2.0.2`,
  `glob@14.0.6`, `isbinaryfile@4.0.10`, `junk@4.0.1`, `minipass@7.1.3`, `path-scurry@3.0.0`,
  `pe-library@1.0.1`, `plist@3.1.1`, `postject@1.0.0-alpha.6`, `progress@2.0.3`,
  `promise-retry@2.0.1`, `resedit@2.0.3`, `retry@0.12.0`, `sumchecker@3.0.1`,
  `undici-types@7.24.6`, `undici@7.30.2`, `xmlbuilder@15.1.1`, `yargs-parser@22.0.0`.
- The other 15 packages of the closure were already in the lockfile and are reused at the same
  version: `@isaacs/nonrecursive-glob-match@1.1.0`, `balanced-match@4.0.4`, `brace-expansion@5.0.13`,
  `cross-spawn@7.0.6`, `debug@4.4.3`, `graceful-fs@4.2.12`, `isexe@2.0.0`, `lru-cache@11.5.3`,
  `minimatch@11.0.9`, `ms@2.1.3`, `path-key@3.1.1`, `semver@7.8.6`, `shebang-command@2.0.0`,
  `shebang-regex@3.0.0`, `which@2.0.2`.
- The resolved versions equal those section 4 named (`@electron/get` 5.1.0, `@electron-internal/extract-zip`
  1.0.8, `@electron/asar` 4.3.2, `@electron/osx-sign` 2.7.2, `@electron/notarize` 3.1.2,
  `@electron/universal` 3.0.6, `@electron/windows-sign` 2.1.0, `@types/node` 24.19.2, `undici` 7.30.2,
  `undici-types` 7.24.6).

### Check 3: how and from where the framework is downloaded (result: facts recorded)

Files read: `electron/index.js`, `cli.js`, `install.js`, `checksums.json` (45.4.1) and
`@electron/get/dist/{index,artifact-utils,Cache,proxy,FetchDownloader}.js` (5.1.0), plus
`@electron/packager/dist/download.js` (20.3.0).

- **First run downloads.** `index.js` runs `getElectronPath()` at `require` time. When `path.txt`
  or `dist/<binary>` is missing, it spawns `install.js` synchronously ("Downloading Electron binary...").
  So `require('electron')` from plain Node, and `cli.js` (the `electron` bin), both download the
  framework. Inside a running Electron app the module is built in and this file is not used.
- **Host.** `artifact-utils.js`: `BASE_URL = 'https://github.com/electron/electron/releases/download/'`,
  URL `BASE_URL + v45.4.1 + '/' + electron-v45.4.1-darwin-arm64.zip`. The CDN host behind GitHub's
  redirect is still **Unverified** (check 5).
- **Checksum verification is on by default.** `@electron/get` verifies every artifact with
  `sumchecker` (sha256) unless the caller passes `unsafelyDisableChecksums`. `electron/install.js`
  passes the embedded `checksums.json` (67 entries, shipped in the npm tarball and so covered by the
  registry integrity; `electron-v45.4.1-darwin-arm64.zip` =
  `d080c3b05a01bd16137f2c12ab9ebf083c577757fe846844ba325bafa8e8bdf4`) unless
  `electron_use_remote_checksums` or `npm_config_electron_use_remote_checksums` is set.
  `@electron/packager` passes only `opts.download` through, so by default it downloads the release's
  remote `SHASUMS256.txt` from the same host (cache bypassed for that file). Ticket 11 can pass
  `download: { checksums: <electron/checksums.json> }` to the packager to verify against the
  registry-covered embedded list instead.
- **Cache.** `env-paths('electron', { suffix: '' }).cache`, on macOS `~/Library/Caches/electron/`;
  cached zips are re-checked against the checksums and discarded on mismatch.

### Download redirect variables (for ticket 11)

`@electron/get` 5.1.0 `mirrorVar(name)` reads, in this order of precedence, for each of `mirror`,
`nightlyMirror`, `customDir`, `customFilename`, `customVersion`:
`npm_config_electron_<name>`, `NPM_CONFIG_ELECTRON_<SNAKE_NAME>`, `npm_config_electron_<snake_name>`,
`npm_package_config_electron_<name>`, `npm_package_config_electron_<snake_name>`, then
`ELECTRON_<SNAKE_NAME>`, then the caller's `mirrorOptions`. The environment therefore overrides
options passed in code. Names in use:

- Redirect the host or path: `ELECTRON_MIRROR`, `ELECTRON_NIGHTLY_MIRROR`, `ELECTRON_CUSTOM_DIR`,
  `ELECTRON_CUSTOM_FILENAME`, `ELECTRON_CUSTOM_VERSION`, and their `npm_config_electron_*` /
  `npm_package_config_electron_*` forms.
- Cache and checksums: `electron_config_cache` (cache root, read by `install.js`), `force_no_cache`
  (`true` re-downloads), `electron_use_remote_checksums` / `npm_config_electron_use_remote_checksums`
  (use the remote `SHASUMS256.txt` instead of the embedded list).
- Platform and binary: `ELECTRON_INSTALL_PLATFORM`, `ELECTRON_INSTALL_ARCH`, `npm_config_platform`,
  `npm_config_arch`, `ELECTRON_OVERRIDE_DIST_PATH` (use a framework from another folder).
- Network: `ELECTRON_GET_USE_PROXY` (enables undici `EnvHttpProxyAgent`), `ELECTRON_GET_NO_PROGRESS`.
- `ELECTRON_SKIP_BINARY_DOWNLOAD` (section 5) does **not** occur in `electron` 45.4.1 or
  `@electron/get` 5.1.0: there is no skip variable, because no install script runs.

### Check 4: API, option and fuse names of section 8 (result: confirmed, one correction)

Files read: `electron/electron.d.ts` ("Type definitions for Electron 45.4.1") and
`@electron/fuses/dist/config.d.ts` and `README.md` (2.1.3).

| Row | Name | 45.4.1 / 2.1.3 |
|---|---|---|
| 1 | `autoUpdater`, `setFeedURL`, `checkForUpdates` | present |
| 2 | packager update feed | `@electron/packager` 20.3.0 `dist` has no update feed or update metadata code; it only strips `publishConfig` from the packaged `package.json` |
| 3 | `crashReporter`, `start({ submitURL, uploadToServer })` | present; `uploadToServer` "Default is `true`", `submitURL` "Required unless `uploadToServer` is `false`" |
| 4 | `BrowserWindow`, `WebContentsView`, `contextIsolation`, `nodeIntegration`, `sandbox` | present |
| 5 | `app` event `web-contents-created`, `setWindowOpenHandler`, `will-navigate`, `app.enableSandbox()` | present |
| 6 | `session.defaultSession.setPermissionRequestHandler` | present; the typings add that `setPermissionCheckHandler` must also be set for complete permission handling |
| 7 | `shell.openExternal` | present |
| 8 to 11 | `FuseV1Options.RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`, `GrantFileProtocolExtraPrivileges` | present (indexes 0, 2, 3, 4, 5, 7). Also present, not in section 8: `EnableCookieEncryption`, `LoadBrowserProcessSpecificV8Snapshot`, `WasmTrapHandlers`; config options `resetAdHocDarwinSignature` (README: required on arm64 macOS when not codesigning right after flipping) and `strictlyRequireAllFuses` |
| 12 | `--remote-debugging-port` | not in the typings (a Chromium switch, appended only through `app.commandLine.appendSwitch`); see the correction below |
| 13, 14 | telemetry; `setSpellCheckerEnabled` | `Session.setSpellCheckerEnabled` present; the telemetry statement is not checkable from typings and stays **Unverified** (check 7) |
| 15 | `app.requestSingleInstanceLock` | present; the lock mechanism on macOS stays **Unverified** (check 7) |

### Corrections to section 8

| Row | Section 8 says | Installed files say |
|---|---|---|
| 12 | "rejected by fuse 9" | The fuses README describes `EnableNodeCliInspectArguments` as disabling "the `--inspect` and `--inspect-brk` family of CLI options", Node's inspector. Nothing in `@electron/fuses` 2.1.3 names Chromium's `--remote-debugging-port`. The protection for row 12 is that the shell never appends the switch (ticket 10 grep) and check 7's `lsof` showing no listener; the fuse is not a control for it |
| 6 | `setPermissionRequestHandler` denies all | Add `setPermissionCheckHandler` returning `false`, per the 45.4.1 typings, for complete denial |

### Check 6: advisories (result: no advisory affecting the pinned versions)

- `pnpm audit --prod`, run once at the root: exit 1, "1 vulnerabilities found, Severity: 1 high":
  `effect` <=3.22.0 (GHSA-7589-6fvf-x4pw), path `packages__core>@mastra/core>hono-openapi>...>effect`.
- `pnpm audit`, run once at the root: exit 1, the same single high advisory, path
  `packages__core>prisma>@prisma/config>effect`.
- Neither report names `electron`, any `@electron/*` package, `apps__shell` or any of the 53 packages
  above. The `effect` finding predates this ticket and is outside the shell tree.
- `https://github.com/electron/electron/security/advisories` page 1 of 7 (HTTP 200, the 10 newest,
  2026-07-27 to 2026-10-22) and the four High entries opened one by one: GHSA-jr5w-w6x2-84p9
  (affects `>= 45.0.0-alpha.1, < 45.0.0-beta.6`, patched in 45.0.0-beta.6), GHSA-gr2m-v5gq-v685,
  GHSA-9qh4-3jw8-366w and GHSA-j84w-jfhq-vhvj (each affects `< 41.10.6`, 42 below 42.9.2 and 43
  below 43.4.1). None affects 45.4.1. Pages 2 to 7 were not opened; they hold advisories published
  before 2026-07-27, earlier than the 45 line (45.0.0 on 2026-10-21), and `pnpm audit` reports none
  for the pinned versions.

### Results of 2026-11-19 (owner-approved run of checks 5, 6 and 8)

Run by the supervisor at the owner's request ("run 5, 6 and 8"). The build used install step 12's
own command, `corepack pnpm --filter @studio/shell run package -- --node-bin ... --cli-main ...
--data-home ... --web-port 4310 --api-port 4311`, with every `STUDIO_ELECTRON_DOWNLOAD_VARIABLES`
name unset. `scripts/install.sh` was not run, because its download question needs a terminal and
it would also apply the step 8 migrations. The copy then followed `install_shell_app`: `ditto`
into `~/Applications/Video Studio.app` (absent before), followed by `codesign --verify --deep --strict`.
Baked values: node `~/Library/pnpm/bin/node`, cli
`tools/cli/dist/main.js`, data home `~/Library/Application Support/VideoStudio`.

- Check 5, download: the package script named `electron-v45.4.1-darwin-arm64.zip` from
  `https://github.com/electron/electron/releases/download/`, checked against the npm `electron`
  `checksums.json`. The final host behind GitHub's redirect is `release-assets.githubusercontent.com`
  (HEAD on the zip URL: HTTP 302 to that host). It was **Unverified** until now. Zip in cache:
  121,010,879 bytes. Built app: 264,403,910 bytes (`tamanho:` line); `du -sk` gives 259,100 KiB for
  both the built and the installed copy. That is under the 400 MB revisit trigger. Fuses as printed by the script:
  RunAsNode off, EnableNodeOptionsEnvironmentVariable off, EnableNodeCliInspectArguments off,
  EnableEmbeddedAsarIntegrityValidation on, OnlyLoadAppFromAsar on, GrantFileProtocolExtraPrivileges
  off. `codesign --verify --strict`: valid on disk and satisfies its Designated Requirement. Bundle id
  `com.videostudio.shell`.
- Check 6, audits after the `effect` 3.22.1 override (`9470650`): `pnpm audit --prod` and `pnpm audit`
  both say "No known vulnerabilities found". The GitHub advisory database (`gh api advisories`,
  ecosystem npm) lists 79 advisories for `electron`; filtered by `affects=electron@45.4.1`, it returns none.
- Check 8, Gatekeeper: the installed app has no `com.apple.quarantine` attribute, only
  `com.apple.provenance`. `codesign -dv`: `Signature=adhoc`, no team identifier. `spctl --assess
  --type execute` answers `rejected`, as expected for an app that is not notarized. Gatekeeper
  applies that verdict only to quarantined apps. `open` started the app (main process
  `Contents/MacOS/Video Studio` running 6 s later) with no block. The owner confirms visually that
  no prompt appeared when testing.

### Pending, owner-run

- Check 7: no socket on the shell's processes, no outbound connection in 10 minutes idle and one
  start/stop cycle, fuse states read back, ad-hoc signature, idle resident memory.
- Check 8, visual part: confirm that no Gatekeeper dialog appeared when the app opened.
