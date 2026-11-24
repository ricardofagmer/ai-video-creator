# EngineOS Video Creator

A local catalog and AI-assisted video pipeline that runs on one Mac. You keep your assets, recipes
and runs in a local database, start runs from the browser, review the results and publish them.
Nothing leaves the machine except the calls to the AI providers you configure.

## Getting started

There are two ways to install. The app from the portal is the intended way for users. The
`scripts/install.sh` script installs from this source folder and is the development path.

**Not yet released.** No release has been published and the portal is not deployed yet. Its
address is decided at deploy time, so there is no download link today. Until a release exists,
use the development install in step 2.

### 1. Install the app from the portal

You need a Mac with Apple Silicon (arm64). The app carries its own Node, ffmpeg and ffprobe, so
you do not need Homebrew, Terminal or this source folder.

1. Open the portal and download the installer for your Mac. The file is named
   `EngineOS-Video-Creator-<version>-arm64.dmg`. The portal shows its SHA-256.
2. Open the `.dmg` and drag **EngineOS Video Creator** onto the Applications shortcut beside it.
3. Double-click the app in Applications. The app is not notarized by Apple and not signed with a
   Developer ID, so macOS refuses to open it the first time. Close the dialog. Do not choose Move to
   Trash.
4. Within about an hour, choose Apple menu > System Settings > Privacy & Security (scroll down if
   needed). Under Security, click **Open Anyway**. Enter your login password, then click OK. From
   then on the app opens without asking. Control-click > Open does not work for this on current
   macOS, so do not use it.

The app has no Dock icon. It lives in the menu bar as **Estúdio** (**Studio** when your Mac is in
English, **Estudio** in Spanish).

#### First-run setup

On the first launch the app opens a **Studio Setup** window and runs these steps:

1. Check the app files.
2. Create the data folder (`~/Library/Application Support/VideoStudio`).
3. Prepare the database.
4. Set the passphrase. You type it in the setup window (8 to 1024 characters). Only its hash is
   kept.
5. Optional downloads: the search model and the capture browser. Each one shows its source and size
   and downloads only if you click **Download**. **Not now** is remembered, and the studio works
   without them.
6. Register the watcher with launchd.
7. Load the catalog.
8. Start the services.
9. Check health.

Setup runs again at every launch and skips each step that is already done. If a required step
fails, setup stops with the reason and a **Try again** button. **Set up / Repair** in the menu opens
the window and runs setup again.

Setup does not start while the app runs from the disk image or from a temporary copy that macOS
made. Move the app to Applications and open it from there.

The installed app always uses ports 4310 (web) and 4311 (API) and the data folder above. When setup
finishes, open the studio with **Open studio** in the menu.

To update, download the newer `.dmg` and replace the app in Applications. The data folder is
outside the app, so it is kept. There is no automatic update.

#### Connect this computer to the portal

The portal can show which version is installed and whether each part is healthy. It reads this
from the local API on `127.0.0.1`, from your browser. Nothing about the computer is sent to the
portal's server.

1. Make sure the services are running.
2. Choose **Connect to portal** in the menu. The app creates a one-time code and opens the portal in
   your browser with the code in the address. Finish connecting there. The code is valid for 5
   minutes and works once.
3. **Disconnect portal** revokes every portal access at once.

In Safari the portal cannot read the local API, so it offers the download and an **Open studio**
link only. Chrome, Edge and Firefox ask for permission first.

When the release manifest names a newer version, the menu shows **Update available: <version>**.
Clicking it opens the download.

Limits today:

- The portal address and the release manifest address are written into the app when it is
  packaged (see Settings). A build packaged without them ships with **Connect to portal: portal
  address not configured** and no update line. A value in the app's own environment overrides the
  packaged one.
- The app passes the portal address to the API it starts, so the API accepts the portal only when
  that address is set.
- The capture browser is not offered by the installed app's setup in this version.
- The installed app does not put the `studio` command on your PATH. Wherever this guide says
  `studio`, an installed app uses its own copy instead, for example:
  `"/Applications/EngineOS Video Creator.app/Contents/Resources/runtime/bin/studio" doctor`.
  If the app is not in `/Applications`, use its real location.

### 2. Install from source (development)

This path needs:

- A Mac with Apple Silicon (arm64). Run Terminal natively, not under Rosetta.
- [Homebrew](https://brew.sh). The installer uses it but never installs it for you.
- Your own user account. Do not run anything with `sudo`.

The installer adds anything else that is missing (Node 22 or later, ffmpeg, Corepack and pnpm).
It asks once before it uses Homebrew.

From this folder:

```bash
scripts/install.sh --dry-run
```

This lists every step and what it would change, and changes nothing. When the list looks right:

```bash
scripts/install.sh
```

It runs 15 steps:

1. Checks macOS and the architecture.
2. Installs dependencies with Homebrew.
3. Sets up pnpm.
4. Installs the workspace.
5. Builds the workspace.
6. Creates the data folder.
7. Fetches the local search model (optional).
8. Runs the database migrations.
9. Installs Playwright.
10. Sets the studio passphrase.
11. Puts the `studio` command on your PATH.
12. Installs the menu-bar app (optional).
13. Registers the watcher with launchd.
14. Seeds the catalog.
15. Starts the web app and the API, then runs `studio doctor`.

You can safely run it again: each step checks first and skips work that is already done. It never
deletes your data.

Options:

| Option | Effect |
|---|---|
| `--dry-run` | Show the plan, change nothing |
| `--yes` | Skip only the Homebrew confirmation |
| `--reset-passphrase` | Set a new studio passphrase |
| `--skip-shell` | Skip the menu-bar app |

In step 10 you type a passphrase in the terminal. You will use it to sign in to the studio in the
browser. The installer never sees it: only its argon2id hash is stored.

### 3. Add your provider keys

Keys are stored in the macOS Keychain. macOS asks you for the value, so it never shows on screen
and never goes into a file or your shell history.

```bash
studio secrets set anthropic-api-key
```

```bash
studio secrets set elevenlabs-api-key
```

If the same key is also set as an environment variable, the environment variable wins.

### 4. Open the studio

Open <http://127.0.0.1:4310> in your browser and sign in with your passphrase. The interface is in
Portuguese (pt-BR). Pick the light, dark or system theme with the toggle in the top bar.

The main screens:

| Screen | Path | What you do there |
|---|---|---|
| Catalog | `/catalogo` | Browse and add assets: templates, skills, prompts, music, brand kit |
| Recipes | `/receitas` | Reusable pipelines that turn a brief into a video |
| Runs | `/execucoes` | Start a run, follow it, review it (`/execucoes/[id]/revisao`) |
| Comparisons | `/comparacoes` | Compare runs side by side |
| Schedules | `/agendamentos` | Runs that start on a schedule |
| Accounts | `/contas` | Connect publishing platforms |
| Insights | `/indicadores` | Ratings, review times, cost and catalog use across runs |
| Metrics import | `/metricas/importar` | Import platform performance numbers |

### 5. Check that it is healthy

```bash
studio doctor
```

This checks the services and the watcher, the database and storage, search, schedules, platform
connections and curation. It tells you how to fix anything it marks.

## Everyday use

| Command | What it does |
|---|---|
| `studio start` | Start the web app and the API |
| `studio stop` | Stop them |
| `studio status` | Show what is running |
| `studio doctor` | Diagnose problems |
| `studio catalog seed` | Load the `seeds/` folder into the catalog again (safe to repeat) |
| `studio catalog search <text>` | Search the catalog from the terminal |
| `studio passphrase set` | Change the passphrase |

Run `studio --help`, or `studio <command> --help`, for the full list. It includes runs, schedules,
metrics, platforms and HyperFrames.

The watcher runs on its own under launchd (`com.videostudio.watcher`). It starts again after a
reboot and keeps running when the web app is stopped. If you installed the menu-bar app, the
**Estúdio** icon shows the status and has Start, Stop and Open buttons
(see [apps/shell/README.md](apps/shell/README.md)).

Development install: after you pull new code, run `scripts/install.sh` again, then restart with
`studio stop` and `studio start`.

## Settings

| Variable | Default | Changes |
|---|---|---|
| `ENGINEOS_VIDEO_CREATOR_WEB_PORT` | `4310` | Web port |
| `ENGINEOS_VIDEO_CREATOR_API_PORT` | `4311` | API port |
| `ENGINEOS_VIDEO_CREATOR_HOME` | `~/Library/Application Support/VideoStudio` | Data folder (database, assets, runs, logs) |
| `ENGINEOS_VIDEO_CREATOR_SEED_SOURCE_ROOT` | `~/projects/ai-video-creator` | Folder the seed reads from (see [seeds/README.md](seeds/README.md)) |

The web and API ports must be different. Both bind to `127.0.0.1` only. The installed app ignores
these four and always uses ports 4310 and 4311 and the default data folder.

Portal settings. Both have no default, and neither is a secret:

| Variable | Read by | Changes |
|---|---|---|
| `ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN` | the menu-bar app and the API | The portal's origin, `https://host[:port]` with no path. Unset: the menu has no **Connect to portal** entry and the API accepts no cross-origin caller |
| `ENGINEOS_VIDEO_CREATOR_RELEASE_MANIFEST_URL` | the menu-bar app | The `https` address of `latest.json`. Unset: the menu never shows **Update available** |

An invalid value counts as unset. The portal itself is configured at build time with its own
`NEXT_PUBLIC_` variables (see `apps/portal/.env.example`).

## Uninstall

Installed app: choose **Uninstall** in the menu. It stops the services, removes the watcher agent
and the login item, and moves the app to the Trash. Your data folder is kept. To delete it too,
tick **Also delete my data** and then confirm in a second question; the data folder then goes to
the Trash. Keys in the macOS Keychain are never removed. If a part fails, the app lists what is
left.

Development install:

```bash
scripts/uninstall.sh
```

## For developers

This is a pnpm + Turborepo monorepo (Node 22 or later, `pnpm@10.12.1` through Corepack).

| Folder | Package | Role |
|---|---|---|
| `apps/web` | `@studio/web` | Next.js studio UI |
| `apps/api` | `@studio/api` | NestJS API |
| `apps/watcher` | `@studio/watcher` | NestJS worker that runs the pipeline |
| `apps/shell` | `@studio/shell` | Electron menu-bar app; also the installed app and its first-run setup |
| `apps/portal` | `@studio/portal` | Hosted download and status portal (static Next.js) |
| `packages/core` | `@studio/core` | Domain logic, Prisma (SQLite), secrets, paths |
| `packages/shared` | `@studio/shared` | Types and schemas shared by the apps |
| `packages/ui` | `@studio/ui` | Design system: tokens, components, theme |
| `packages/video`, `packages/hyperframes`, `packages/toolbox` | `@ace/video`, `@studio/hyperframes`, `@ace/toolbox` | Video rendering and tooling |
| `tools/cli` | `@studio/cli` | The `studio` command |

Workspace commands, run from this folder:

| Command | Runs |
|---|---|
| `pnpm build` | Build every package |
| `pnpm typecheck` | Type-check every package |
| `pnpm lint` | Lint every package |
| `pnpm test` | Run the tests (the web app has no test runner yet) |
| `pnpm --filter @studio/web dev` | Web UI in dev mode on port 4310 |

To install new dependencies, follow [ADR 0001](docs/adr/0001-stack-and-monorepo.md): only the packages listed in
`pnpm-workspace.yaml` may run install scripts.

### Cutting a release (maintainers)

Releases are built by `.github/workflows/release.yml`. No release has been cut yet.

1. Set `version` in `apps/shell/package.json`. It must be `X.Y.Z`, with no suffix.
2. Push the tag `v<version>`, for example `v0.1.0` for version `0.1.0`. A tag that does not match
   the version stops the build.
3. The workflow builds ffmpeg, then the `.dmg`, `latest.json` and the installer checksum on a macOS
   arm64 runner. The `publish` job runs only for a `v*` tag, in the `release` GitHub environment.
   It creates the GitHub release with the assets and writes `latest.json` to the
   `release-manifest` branch, which the portal reads. It refuses to replace a newer version on that
   branch with an older one.

Dry run: start the workflow by hand (Actions > Release > Run workflow). `dry_run` is on by default:
the run builds everything, keeps the result as a workflow artifact for 7 days and publishes
nothing. A manual run publishes only when it starts from a `v*` tag with `dry_run` turned off.

Rolling back: deleting a GitHub release does not change the `release-manifest` branch. Revert that
branch's last commit as well, or the portal keeps offering the withdrawn version.

ffmpeg and ffprobe are not downloaded as binaries. CI builds them from the pinned sources in
`scripts/ffmpeg-build/sources.lock.json` with `scripts/ffmpeg-build/build-ffmpeg.sh` (see
[scripts/ffmpeg-build/README.md](scripts/ffmpeg-build/README.md)). The build is licensed
GPL-3.0-or-later. The licence texts ship inside the app, and every release publishes the matching
source archive, `ffmpeg-sources-<version>.tar.gz`, as a release asset listed in `latest.json`.

To build the `.dmg` on your own Apple Silicon Mac, run the ffmpeg build first, then
`pnpm --filter @studio/shell run package:dmg` after `pnpm install` and `pnpm exec turbo run build`.
The output goes to `apps/shell/out/dmg/release/`.

## Documentation

- [docs/prds](docs/prds) and [docs/specs](docs/specs): what the studio does, and how.
- [docs/adr](docs/adr): architecture decisions and why they were made.
- [docs/design-system.md](docs/design-system.md): tokens, light and dark mode, styling rules.
- [docs/RUN-FORMAT.md](docs/RUN-FORMAT.md): the run folder format.
- [seeds/README.md](seeds/README.md): the catalog seed format.
