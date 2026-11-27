# desktop-installer: plan

Status: rev 3, frozen (2026-11-23: section 9 applies vetting 0006 and the owner's ffmpeg decision; C1 rev 2, C2 rev 2, C3 rev 3). Earlier: rev 2, frozen. Rev 1 approved by the owner 2026-11-23. Rev 2 (2026-11-23) adds one clarification to C3, the runtime variable, so tickets 01 and 02 stay independent; no approved decision changed. C1 rev 1, C2 rev 1, C3 rev 2.
Sources: PRD `docs/prds/2026-11-23-desktop-installer.md`, ADR 0010. Source revision `0060c10`.
Risk: high (new trust boundary between a web origin and the local api; distribution of
executables). Autonomy A3, human approval before any external effect (release, deploy).

## 1. Surfaces

| Surface | Change | Owner path |
|---|---|---|
| Shared contract | New `install` schemas and route segments | `packages/shared/src/api/install.ts`, `routes.ts` |
| Api | New Nest `InstallModule`: presence, pair, status; scoped CORS and host check | `apps/api/src/install/` |
| Core | Runtime locator: resolves node, ffmpeg, payload and data home from the app location | `packages/core/src/runtime/` |
| Shell | First-run setup, "Connect to portal", update notice, uninstall; spawns bundled node | `apps/shell/src/` |
| Packaging | Payload staging, ad hoc signing of nested binaries, `.dmg` | `apps/shell/scripts/` |
| Portal | New static Next.js app: downloads, detection, pairing, status | `apps/portal/` |
| CI | Release workflow on `v*` tags | `.github/workflows/release.yml` |
| Docs | README install section, PRD 0001 amendment notes, ADR 0005 status line | `README.md`, `docs/` |

The watcher's launchd template stays; first-run setup renders it with paths inside the app.

## 2. Frozen contract C1: install status (rev 1)

Home: `packages/shared/src/api/install.ts`. Zod schemas; types inferred. Single owner: ticket 01.

Routes, all under the existing api origin `http://127.0.0.1:<api port>`:

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/install/presence` | none | `InstallPresence` |
| POST | `/install/pair` | body `{ code }` | `InstallPairing` or 401 |
| GET | `/install/status` | `Authorization: Bearer <token>` | `InstallStatus` or 401 |

```ts
type InstallPresence = {
  product: 'engineos-video-creator';
  contract: 1;
  version: string;            // semver of the installed app
  platform: 'darwin-arm64' | 'win32-x64';
  paired: boolean;            // true when at least one token exists
};

type InstallPairing = { token: string };   // 43 chars, base64url of 32 random bytes

type ComponentState = 'ok' | 'missing' | 'stopped' | 'degraded' | 'not-installed';

type InstallStatus = {
  contract: 1;
  version: string;
  platform: InstallPresence['platform'];
  checkedAt: string;          // ISO 8601
  components: {
    api: 'ok';
    web: ComponentState;
    watcher: ComponentState;
    database: ComponentState;
    ffmpeg: ComponentState;
    searchModel: ComponentState;       // optional component: 'not-installed' is not an error
    captureBrowser: ComponentState;    // optional component
    dataHome: ComponentState;
  };
  setup: 'complete' | 'pending';
};
```

Rules of the contract:

- No path, user name, host name, port list, catalog data or secret in any field.
- Cross-origin: `Access-Control-Allow-Origin` is the exact configured portal origin, on these
  three routes only. No `Access-Control-Allow-Credentials`. Methods `GET, POST`; headers
  `authorization, content-type`. Every other route keeps today's same-origin behaviour.
- The portal origin comes from `ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN`; unset means no
  cross-origin caller is accepted. It must be `https://` with no path.
- Requests whose `Host` is not `127.0.0.1:<api port>` or `localhost:<api port>` get 421.
- Pair code: 8 characters from an unambiguous alphabet, valid 5 minutes, single use, at most
  5 failed attempts per code and per minute; issued only by the shell through the CLI.
- Token storage: SHA-256 of the token in the database; compared in constant time; at most 5
  live tokens; "revoke all" from the shell.
- A contract change increments `contract`; the portal shows "update the app" when it sees a
  number it does not know.

## 3. Frozen contract C2: release manifest (rev 1)

`latest.json`, published as a release asset and read by the portal at build time and at load:

```json
{
  "version": "1.0.0",
  "publishedAt": "2026-12-01T00:00:00Z",
  "assets": [
    { "platform": "darwin-arm64", "file": "EngineOS-Video-Creator-1.0.0-arm64.dmg",
      "url": "https://github.com/<owner>/<repo>/releases/download/v1.0.0/...", "sha256": "<hex>", "bytes": 0 }
  ]
}
```

## 4. Frozen contract C3: runtime layout (rev 2)

```
<App>/Contents/Resources/
  app.asar                      shell main (fuses unchanged from ADR 0005)
  runtime/
    node/bin/node               pinned Node, ad hoc signed
    bin/ffmpeg, bin/ffprobe     static, ad hoc signed
    payload/{api,web,watcher,cli}/   built output + production node_modules
    payload/manifest.json       { version, builtAt, files sha256 }
    licenses/                   Node, ffmpeg and dependency licence texts
```

Data home is unchanged. The app never writes inside its own bundle.

Rev 2: the shell sets `ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR` to the absolute `runtime/` folder for
every process it spawns. Set means packaged mode: node, ffmpeg, ffprobe and the payload are
resolved under it and nowhere else. Unset means development mode: today's resolution (PATH,
repository build output). The variable holds a path, never a secret.

## 5. First-run setup (shell)

Ordered, each step idempotent and reported in a setup window (local content only):
1 verify payload manifest, 2 data folders 700, 3 migrations (`prisma migrate deploy`),
4 passphrase (entered in the setup window, passed to the CLI over stdin, only the argon2id
hash is stored), 5 optional downloads with consent, 6 watcher agent rendered and
bootstrapped, 7 seed catalog, 8 start api and web, 9 doctor. A failed required step stops
with the reason and a retry button; an optional step warns and continues.

## 6. Acceptance (EARS)

| Id | Statement |
|---|---|
| DI-AC-01 | When the `.dmg` is opened on an Apple Silicon Mac with no Homebrew, Node or checkout, the app shall start and complete setup with no Terminal step. |
| DI-AC-02 | When setup is run a second time, the system shall change nothing and report each step as already done. |
| DI-AC-03 | While the app is installed, no process of the studio shall resolve a path outside the app bundle and the data home (except user-chosen source folders). |
| DI-AC-04 | When an optional download is refused or fails, the system shall finish setup and report that component as `not-installed`. |
| DI-AC-05 | When a newer app is installed over an older one, the system shall keep the data home, the passphrase hash and stored keys, and apply pending migrations. |
| DI-AC-06 | When uninstall is chosen, the system shall remove the watcher agent, the login item and the app, and shall keep the data home unless deletion was confirmed separately. |
| DI-AC-07 | When `GET /install/presence` is called, the api shall answer with product, contract, version, platform and paired, and nothing else. |
| DI-AC-08 | If a request to an `/install/*` route carries an `Origin` other than the configured portal origin, then the api shall send no CORS allow header. |
| DI-AC-09 | If a request carries a `Host` other than the loopback host and api port, then the api shall answer 421. |
| DI-AC-10 | If `/install/status` is called without a valid token, then the api shall answer 401 with no status body. |
| DI-AC-11 | When a valid one-time code is posted to `/install/pair`, the api shall return a token once and reject the same code afterwards. |
| DI-AC-12 | If a pair code is older than 5 minutes or 5 attempts failed, then the api shall reject it. |
| DI-AC-13 | The status payload shall contain no file path, user name or secret, in every component state. |
| DI-AC-14 | The api listener shall remain bound to `127.0.0.1` only. |
| DI-AC-15 | When the portal is opened on a computer without the app, it shall show "not installed" and the download for the detected OS within 5 seconds. |
| DI-AC-16 | When the portal is opened paired on a computer with the app, it shall show the version and each component state, refreshed at most every 10 seconds while visible. |
| DI-AC-17 | When `latest.json` names a version above the installed one, the portal and the app menu shall show "update available" with the download link. |
| DI-AC-18 | If the browser blocks loopback requests, then the portal shall say so and offer "Open studio" and the download, without an error state. |
| DI-AC-19 | When a `v*` tag is pushed, CI shall publish the `.dmg`, its SHA-256 and `latest.json` to that release, and the portal shall show the same SHA-256. |
| DI-AC-20 | The packaged app shall pass `codesign --verify --deep --strict` and keep the six fuse states of ADR 0005. |
| DI-AC-21 | The portal shall send no request carrying computer status to any host other than `127.0.0.1`. |
| DI-AC-22 | (Phase 2) The Windows installer shall meet DI-AC-01 to 06 and serve the same contract C1 with `platform: 'win32-x64'`. |

## 7. Rollback

- Portal: redeploy the previous Vercel build; it holds no data.
- Release: delete or mark the GitHub release as pre-release; `latest.json` of the previous
  release becomes current.
- App: uninstall from the menu and reinstall from source with `scripts/install.sh`, which
  stays supported. The data home is forward-migrated only; a migration added by this feature
  (pair tokens table) is additive and ignored by older builds.
- Api surface: unset `ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN` to refuse every cross-origin caller.

## 8. Proposed tickets (for the granularity review)

Phase 1, macOS:

| # | Ticket | Delivers | Blocked by |
|---|---|---|---|
| 00 | Vetting 0006 | Vendor-checked facts: browser loopback rules, Gatekeeper steps, ffmpeg build and licence, Node binary source | none |
| 01 | Install status contract and api module | C1 in shared; `InstallModule` with presence, pair, status, CORS, host check, token store migration | none |
| 02 | Relocatable runtime | Runtime locator in core; CLI, watcher and service specs resolve node, ffmpeg and payload from it | none |
| 03 | Payload staging and `.dmg` | Package script stages C3, signs nested binaries, builds the `.dmg` and manifest | 02 |
| 04 | First-run setup and uninstall in the shell | Setup window and steps of section 5; uninstall; bundled node spawn | 02 |
| 05 | Release workflow | `release.yml`, `latest.json` (C2), checksums | 03 |
| 06 | Portal app | `apps/portal`: downloads, detection, pairing, status, update notice, blocked-browser fallback | 01 (contract only), 00 |
| 07 | Shell portal link | "Connect to portal" (pair code), update notice in the menu, revoke | 01, 04 |
| 08 | Docs | README install section, PRD 0001 and ADR 0005 notes | 03, 06 |
| FP | Final proof | Runs `checks.md` after everything integrates | all |

Wave 1 can run 00, 01, 02 and the portal's static parts in parallel (disjoint paths).

Phase 2, Windows: a second frontier specified after phase 1 integrates (service at logon,
credential storage, ffmpeg build, installer tool vetting, real-machine verification).

## 9. Rev 3 amendments (vetting 0006, 2026-11-23)

Source: `docs/vetting/0006-installer-and-portal.md` section 9. Where this section and an earlier
section disagree, this section wins.

**C1 rev 2 (install status).**
- `OPTIONS` on the three install routes answers `204` with `Access-Control-Allow-Origin: <portal
  origin>`, `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Allow-Headers:
  authorization, content-type`, `Access-Control-Max-Age: 600` and `Vary: Origin`, only for the
  exact portal origin. Actual responses also send `Vary: Origin`. No
  `Access-Control-Allow-Private-Network` header.
- An unsupported platform answers `503` with an empty body. Every pair failure stays `401`.

**C2 rev 2 (release manifest).** `latest.json` gains `"sources": [{ "name": "ffmpeg", "licence":
"GPL-3.0-or-later", "url": "<release asset url>", "sha256": "<hex>" }]`. Each release carries the
ffmpeg corresponding-source archive as an asset (owner decision 2026-11-23: bundle the GPL
build and comply).

**C3 rev 3 (runtime layout).**
```
runtime/
  node/bin/node                 Node v24.22.3 darwin-arm64, SHA-256 pinned, signature checked in CI
  bin/ffmpeg, bin/ffprobe       GPL arm64 build named in vetting 0006, checksum pinned
  payload/node_modules/         ONE shared production tree for api, watcher and cli
                                (non-darwin-arm64 native binaries pruned)
  payload/{api,watcher,cli}/    built output only
  payload/web/                  Next standalone tree, unflattened: server at apps/web/server.js,
                                with .next/static and public copied in
  payload/tools/prisma/         prisma CLI and schema engine, used only for `migrate deploy`
  payload/resources/            files the CLI and watcher read by path (model manifests, templates)
  payload/manifest.json         { version, builtAt, files sha256 }
  licenses/                     node/, ffmpeg/ (GPL text), third-party notices
```
- The web is always started with `HOSTNAME=127.0.0.1` and an explicit `PORT`; without it Next
  standalone listens on every interface.

**Portal behaviour (ticket 06).** Detection is a state machine over: Safari (blocked by design,
decided by user agent), permission `loopback-network` = `prompt` / `denied` / `granted` (query
that name only), connection refused (not installed), present unpaired, paired. Requests go to the
IP literal `http://127.0.0.1:<port>` from the top-level document with `mode: 'cors'` and
`targetAddressSpace: 'loopback'` through one typed wrapper. The 5-second "not installed" verdict
never fires while the permission prompt is open.

**First-run setup (ticket 04).** Step 0: refuse to run setup, and ask the user to move the app to
Applications, when the app's own path is not stable (contains `/AppTranslocation/` or is on a
mounted disk image). Gatekeeper copy everywhere: System Settings > Privacy & Security > Open
Anyway; never Control-click.

**Added acceptance.**

| Id | Statement |
|---|---|
| DI-AC-23 | The packaged web listener shall be bound to `127.0.0.1` only. |
| DI-AC-24 | If the app runs from a translocated or disk-image path, then setup shall not start and shall tell the user to move the app to Applications. |
| DI-AC-25 | Each release shall carry the GPL licence text inside the app and the matching ffmpeg source archive as a release asset named in `latest.json`. |
| DI-AC-26 | When an allowed-origin preflight reaches an install route, the api shall answer 204 with the headers of C1 rev 2; for any other origin it shall send no allow header. |

Ticket mapping: DI-AC-23 to 02/04, DI-AC-24 to 04, DI-AC-25 to 03/05, DI-AC-26 to 01.
Size: the estimated download is 0.4 to 0.6 GB and the installed app 0.9 to 1.2 GB.

### 9.1 Clarifications after wave 1 (2026-11-23, no contract revision change)

- `payload/tools/prisma/` is an installed package tree: `node_modules/prisma/build/index.js` and
  `node_modules/@prisma/engines/schema-engine-darwin-arm64`.
- The Prisma schema and migrations are staged at `payload/resources/packages/core/prisma/`.
  Setup runs `<node> <prisma cli> migrate deploy --schema <that schema>` with
  `PRISMA_SCHEMA_ENGINE_BINARY` set to the bundled engine.
- `payload/resources/` keeps repository-relative paths: `scripts/models/` (manifest, source,
  fetch script), `scripts/lib/common.sh`, `seeds/templates/hyperframes/title-card/`,
  `packages/core/prisma/`.
- `payload/node_modules/` also holds the workspace packages (`@studio/core`, `@studio/shared`,
  `@studio/hyperframes` with its sandbox profile, `@ace/toolbox`).
- The locator (`@studio/core/runtime`) is the single source of these paths; the shell and the
  staging script use the same names.
- Pairing lives in `@studio/core/install` (`InstallPairingModule`, `InstallPairingUseCase`), used
  by the api and by the CLI (ticket 07).
- Open, routed to correction 02c: the embedding manifest default path, `ffmpeg-frames.ts` bare
  name lookup, the runtime error text's i18n home.
- Pair link format (frozen for tickets 06 and 07): the app opens `<portal origin>/#pair=<CODE>`.
- `latest.json` must be readable by the browser with CORS. A GitHub release download URL redirects
  without CORS headers, so ticket 05 also publishes `latest.json` to a dedicated branch
  (`release-manifest`) and the portal's manifest URL is that file's raw address. The release
  asset copy stays. To be confirmed by a real browser read at the final gate.
- Root wiring owned by the supervisor: `turbo.json` build outputs gain `out/**` for the portal.

### 9.2 Owner decision: ffmpeg is built in CI (2026-11-23, contract C4 rev 1)

Vetting 0006 section 10 found that the third-party ffmpeg 9.1 build does not record its x264
revision and vendors no Rust crates, so its complete corresponding source cannot be assembled.
The owner chose "Build in CI (Recommended)". The third-party zip pins are removed; C3 is unchanged
(`runtime/bin/ffmpeg`, `runtime/bin/ffprobe`).

Frozen contract C4, ffmpeg build output:

- Builder: `scripts/ffmpeg-build/build-ffmpeg.sh`, pins in `scripts/ffmpeg-build/sources.lock.json`
  (per source: `name`, `version`, `licence`, `url`, and `sha256` or a git `commit`). A source with
  neither a checksum nor a commit stops the build before any download. The FFmpeg tarball is also
  checked against its detached signature with the pinned release key fingerprint.
- Library set: the smallest set the studio's own ffmpeg calls need, GPL-3.0-or-later, never
  `--enable-nonfree`, static, macOS arm64.
- Output folder, default `apps/shell/out/ffmpeg/`, override `ENGINEOS_FFMPEG_BUILD_DIR`:
  `bin/ffmpeg`, `bin/ffprobe`, `licenses/**`, `ffmpeg-sources-<ffmpegVersion>.tar.gz` (every
  source at the built revision plus the build script and lock file), and `build-manifest.json`:
  `{ ffmpegVersion, licence, configureFlags, binaries: [{name, sha256, bytes}],
  sourceArchive: {file, sha256, bytes}, sources: [{name, version, licence, url, sha256?, commit?}] }`.
- Packaging (`apps/shell/scripts/lib/`) reads that folder, checks both binaries against
  `build-manifest.json`, and stops when the folder is missing. It downloads no ffmpeg binary.
- Release workflow: a `build-ffmpeg` job on a macOS arm64 runner runs before packaging, cached on
  the hash of `sources.lock.json`, and hands the folder over as a workflow artifact. The source
  archive stays a release asset listed in `latest.json.sources` (DI-AC-25 unchanged).

### 9.3 Rollback addition (2026-11-23)

Deleting a release does not revert `latest.json` on the `release-manifest` branch. Rolling a
release back also means reverting that branch's last commit, or the portal keeps offering the
withdrawn version. The publish step refuses to replace a newer version with an older one.

### 9.4 Owner decision: hand-run CLI (2026-11-23, C3 rev 3 addition)

The installed app puts nothing on PATH. The owner chose "Show full command (Recommended)". Packaging
adds `runtime/bin/studio`, a small launcher that finds the runtime from its own location and runs
the bundled CLI. Setup text and the README name its full path. No system folder is touched.

## 9.5 Local preview of a locally built installer (owner decision, 2026-11-23)

C2 keeps release addresses https only. One exception, approved by the owner on 2026-11-23 ("Allow local preview"): under `next dev` the portal also accepts plain http on `127.0.0.1`/`localhost` (`apps/portal/src/release/release-url.ts`), so `scripts/release/serve-local-release.mjs` can serve `apps/shell/out/dmg/release`. An exported production portal never takes the exception.

## 9.6 Local portal origin for a local test package (owner decision, 2026-11-23)

The portal origin stays https only for every published package. One exception, approved by the owner on 2026-11-23 ("Yes, allow locally"): the origin may also be `http://localhost:<port>` or `http://127.0.0.1:<port>`, so a portal under `next dev` can detect and pair with an app installed on the same computer.

- Accepted by: the api (`PortalOriginSchema`, `apps/api/src/platform/api-config.ts`), the shell (`isLocalPortalUrl` in `apps/shell/src/portal/portal-settings.ts`, used by the origin parser, the pair link and the browser hand-off; the release manifest address stays https only).
- Baked by `apps/shell/scripts/package-dmg.mjs` only with `ENGINEOS_VIDEO_CREATOR_ALLOW_LOCAL_PORTAL=1`, and refused on GitHub Actions. A package built this way prints "LOCAL TEST PACKAGE" and must not be published.
- Why it is acceptable: only a process on the same machine can serve a loopback origin, and such a process can already call the loopback api without a browser. Pairing still needs the code shown by the app.
- Residual: a published app accepts a loopback origin if its owner sets the variable in the environment that starts it; the baked value in a published package is always https.
