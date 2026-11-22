# EngineOS Video Creator

A local catalog and AI-assisted video pipeline that runs on one Mac. You keep your assets, recipes
and runs in a local database, start runs from the browser, review the results and publish them.
Nothing leaves the machine except the calls to the AI providers you configure.

## Getting started

### 1. What you need

- A Mac with Apple Silicon (arm64). Run Terminal natively, not under Rosetta.
- [Homebrew](https://brew.sh). The installer uses it but never installs it for you.
- Your own user account. Do not run anything with `sudo`.

The installer adds anything else that is missing (Node 22 or later, ffmpeg, Corepack and pnpm).
It asks once before it uses Homebrew.

### 2. Install

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

After you pull new code, run `scripts/install.sh` again, then restart with `studio stop` and
`studio start`.

## Settings

| Variable | Default | Changes |
|---|---|---|
| `ENGINEOS_VIDEO_CREATOR_WEB_PORT` | `4310` | Web port |
| `ENGINEOS_VIDEO_CREATOR_API_PORT` | `4311` | API port |
| `ENGINEOS_VIDEO_CREATOR_HOME` | `~/Library/Application Support/VideoStudio` | Data folder (database, assets, runs, logs) |
| `ENGINEOS_VIDEO_CREATOR_SEED_SOURCE_ROOT` | `~/projects/ai-video-creator` | Folder the seed reads from (see [seeds/README.md](seeds/README.md)) |

The web and API ports must be different. Both bind to `127.0.0.1` only.

## Uninstall

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
| `apps/shell` | `@studio/shell` | Electron menu-bar app |
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

## Documentation

- [docs/prds](docs/prds) and [docs/specs](docs/specs): what the studio does, and how.
- [docs/adr](docs/adr): architecture decisions and why they were made.
- [docs/design-system.md](docs/design-system.md): tokens, light and dark mode, styling rules.
- [docs/RUN-FORMAT.md](docs/RUN-FORMAT.md): the run folder format.
- [seeds/README.md](seeds/README.md): the catalog seed format.
