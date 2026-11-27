# Project Index

Generated facts at commit `6ebb6b7ffcf4` (2026-11-25T20:05:04.511Z). Detail and sources: [index.json](index.json).
Regenerate with `engineos index refresh`. Narrative and rationale live in the docs linked at the end.

## Start here (6)

- add or change an HTTP route or page: `apps/api/src/catalog`, `apps/api/src/comparisons`, `apps/api/src/connections`, `apps/api/src/curations`, `apps/api/src/health`
- add or change tests: `.engineos/archived/2026/11/test`, `apps/api/src/__tests__`, `apps/api/src/auth`, `apps/api/src/catalog`, `apps/api/src/connections`
- change CI or build conventions: `.github/workflows/ci.yml`, `apps/api/eslint.config.mjs`, `apps/api/src/__tests__/authorization.test.ts`, `apps/api/src/app.module.ts`, `apps/api/tsconfig.build.json`
- change a data model or migration: `packages/core/prisma`, `packages/core/prisma/migrations/20261118000000_init`, `packages/core/prisma/migrations/20261118120000_r2_improvement_loop`, `packages/core/prisma/migrations/20261118180000_curator`, `packages/core/prisma/migrations/20261119120000_r3_outside_signals`
- change a package command or entry point: `apps/api/package.json`, `apps/portal/package.json`, `apps/shell/package.json`, `apps/watcher/package.json`, `apps/web/package.json`
- change environment configuration: `apps/portal/.env.example`, `apps/web/.env.example`

## Packages (15)

- `.` node; entry: none; commands: ace, build, dev, lint, test, typecheck
- `apps/api` nestjs; entry: `apps/api/src/main.ts`; commands: build, lint, start, test, typecheck
- `apps/portal` next; entry: `apps/portal/src/app/layout.tsx`, `apps/portal/src/app/page.tsx`; commands: build, dev, lint, typecheck
- `apps/shell` node; entry: `apps/shell/dist/main.js`, `apps/shell/src/main.ts`; commands: build, lint, package, package:dmg, test, typecheck
- `apps/watcher` nestjs; entry: `apps/watcher/src/main.ts`; commands: build, dev:fixture, lint, start, test, typecheck
- `apps/web` next; entry: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`; commands: build, dev, lint, start, typecheck
- `packages/core` nestjs; entry: none; commands: build, lint, prisma:generate, prisma:migrate:deploy, test, typecheck
- `packages/eslint-config` node; entry: none; commands: none
- `packages/hyperframes` node; entry: `packages/hyperframes/dist/index.js`, `packages/hyperframes/src/index.ts`; commands: build, typecheck
- `packages/shared` node; entry: none; commands: build, lint, test, typecheck
- ... 5 more in index.json

## Modules (154)

- `apps`
- `apps/api/src/__tests__`
- `apps/api/src/auth`
- `apps/api/src/catalog`
- `apps/api/src/comparisons`
- `apps/api/src/connections`
- `apps/api/src/curations`
- `apps/api/src/health`
- `apps/api/src/insights`
- `apps/api/src/install`
- `apps/api/src/logging`
- `apps/api/src/metrics`
- `apps/api/src/platform`
- `apps/api/src/publishing`
- `apps/api/src/recipes`
- `apps/api/src/runs`
- `apps/api/src/schedules`
- `apps/api/src/search`
- `apps/api/src/watcher`
- `apps/portal/src/app`
- `apps/portal/src/components`
- `apps/portal/src/config` - Build-time configuration of the portal.
- `apps/portal/src/detection` - Time source and timer, injected so tests fix instants and fire timers by hand.
- `apps/portal/src/install` - Local Network Access permission for loopback vetting 0006 section 2.2 items 2 and 4 .
- `apps/portal/src/messages`
- `apps/portal/src/platform` - What the user agent string says about this computer and browser.
- `apps/portal/src/release` - Semantic Versioning 2.0.0 precedence section 11 for MAJOR.MINOR.PATCH -pre , the shape InstallVersionSchema accepts.
- `apps/shell/src/actions`
- `apps/shell/src/cli` - The one switch the shell accepts; the uninstaller runs the app with it to remove the login item.
- `apps/shell/src/config`
- `apps/shell/src/controller`
- `apps/shell/src/electron`
- `apps/shell/src/i18n` - Menu languages, the same three the web offers.
- `apps/shell/src/logging`
- `apps/shell/src/menu`
- `apps/shell/src/platform` - Narrows a thrown Node error to its code without trusting its shape.
- `apps/shell/src/portal` - The pair code handed from studio portal pair to the system browser.
- `apps/shell/src/setup`
- `apps/shell/src/state`
- `apps/shell/src/test-support`
- ... 114 more in index.json

## Routes (106)

- `GET /` in `apps/api/src/catalog/catalog.controller.ts`
- `GET /` in `apps/api/src/comparisons/comparisons.controller.ts`
- `GET /` in `apps/api/src/connections/platforms.controller.ts`
- `GET /` in `apps/api/src/curations/curations.controller.ts`
- `GET /` in `apps/api/src/health/health.controller.ts`
- `GET /` in `apps/api/src/insights/insights.controller.ts`
- `GET /` in `apps/api/src/metrics/metric-imports.controller.ts`
- `GET /` in `apps/api/src/recipes/recipes.controller.ts`
- `GET /` in `apps/api/src/runs/runs.controller.ts`
- `GET /` in `apps/api/src/schedules/schedules.controller.ts`
- `GET /` in `apps/api/src/watcher/watcher.controller.ts`
- `PAGE /` in `apps/portal/src/app/page.tsx`
- `PAGE /` in `apps/web/src/app/page.tsx`
- `POST /` in `apps/api/src/catalog/catalog.controller.ts`
- `POST /` in `apps/api/src/comparisons/comparisons.controller.ts`
- `POST /` in `apps/api/src/curations/curations.controller.ts`
- `POST /` in `apps/api/src/metrics/metric-imports.controller.ts`
- `POST /` in `apps/api/src/recipes/recipes.controller.ts`
- `POST /` in `apps/api/src/runs/runs.controller.ts`
- `POST /` in `apps/api/src/schedules/schedules.controller.ts`
- ... 86 more in index.json

## Data models and migrations (30)

- migration `migration` in `packages/core/prisma/migrations/20261118000000_init/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261118120000_r2_improvement_loop/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261118180000_curator/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261119120000_r3_outside_signals/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261119130000_r3_promotion_platform_sample/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261120120000_r4_connected_platforms/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261120180000_r4_publish_metadata_hash/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261123120000_install_pairing/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261123180000_asset_job_cost_source/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261125120000_music_cost_kind/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261125130000_asset_purpose/migration.sql`
- schema `Asset` in `packages/core/prisma/schema.prisma`
- schema `AssetLearningNote` in `packages/core/prisma/schema.prisma`
- schema `AssetVersion` in `packages/core/prisma/schema.prisma`
- schema `Comparison` in `packages/core/prisma/schema.prisma`
- ... 15 more in index.json

## Environment variable names (8)

- `ENGINEOS_VIDEO_CREATOR_API_ORIGIN` from `apps/web/.env.example`
- `ENGINEOS_VIDEO_CREATOR_DEV_AUTO_LOGIN` from `apps/web/.env.example`
- `ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE` from `apps/web/.env.example`
- `ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN` from `apps/web/.env.example`
- `ENGINEOS_VIDEO_CREATOR_WEB_PORT` from `apps/web/.env.example`
- `NEXT_PUBLIC_ENGINEOS_VIDEO_CREATOR_API_PORT` from `apps/portal/.env.example`
- `NEXT_PUBLIC_ENGINEOS_VIDEO_CREATOR_RELEASE_MANIFEST_URL` from `apps/portal/.env.example`
- `NEXT_PUBLIC_ENGINEOS_VIDEO_CREATOR_WEB_PORT` from `apps/portal/.env.example`

## Test locations (99)

- `.engineos/archived/2026/11/test`
- `scripts/e2e`
- `apps/api/src/__tests__`
- `apps/api/src/auth`
- `apps/api/src/catalog`
- `apps/api/src/connections`
- `apps/api/src/metrics`
- `apps/api/src/platform`
- `apps/api/src/publishing`
- `apps/api/src/runs`
- ... 89 more in index.json

## Conventions (8)

- colocated-tests (`apps/api/src/__tests__/authorization.test.ts`)
- eslint (`apps/api/eslint.config.mjs`)
- github-actions (`.github/workflows/ci.yml`)
- nestjs-modules (`apps/api/src/app.module.ts`)
- pnpm-workspace (`pnpm-workspace.yaml`)
- prisma (`packages/core/prisma/schema.prisma`)
- turborepo (`turbo.json`)
- typescript (`apps/api/tsconfig.build.json`)

## Docs (7)

- [README.md](../../README.md)
- [docs/RUN-FORMAT.md](../../docs/RUN-FORMAT.md)
- [docs/adr/](../../docs/adr/)
- [docs/design-system.md](../../docs/design-system.md)
- [docs/prds/](../../docs/prds/)
- [docs/rules/](../../docs/rules/)
- [docs/specs/](../../docs/specs/)
