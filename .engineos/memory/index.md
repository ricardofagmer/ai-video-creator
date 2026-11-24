# Project Index

Generated facts at commit `0060c102fabe` (2026-11-23T01:23:39.262Z). Detail and sources: [index.json](index.json).
Regenerate with `engineos index refresh`. Narrative and rationale live in the docs linked at the end.

## Start here (6)

- add or change an HTTP route or page: `apps/api/src/catalog`, `apps/api/src/comparisons`, `apps/api/src/connections`, `apps/api/src/curations`, `apps/api/src/health`
- add or change tests: `.engineos/archived/2026/11/test`, `apps/api/src/auth`, `apps/api/src/catalog`, `apps/api/src/connections`, `apps/api/src/metrics`
- change CI or build conventions: `.github/workflows/ci.yml`, `apps/api/eslint.config.mjs`, `apps/api/src/app.module.ts`, `apps/api/src/auth/rev7-routes.guard.test.ts`, `apps/api/tsconfig.build.json`
- change a data model or migration: `packages/core/prisma`, `packages/core/prisma/migrations/20261118000000_init`, `packages/core/prisma/migrations/20261118120000_r2_improvement_loop`, `packages/core/prisma/migrations/20261118180000_curator`, `packages/core/prisma/migrations/20261119120000_r3_outside_signals`
- change a package command or entry point: `apps/api/package.json`, `apps/shell/package.json`, `apps/watcher/package.json`, `apps/web/package.json`, `package.json`
- change environment configuration: `apps/web/.env.example`

## Packages (14)

- `.` node; entry: none; commands: ace, build, dev, lint, test, typecheck
- `apps/api` nestjs; entry: `apps/api/src/main.ts`; commands: build, lint, start, test, typecheck
- `apps/shell` node; entry: `apps/shell/dist/main.js`, `apps/shell/src/main.ts`; commands: build, lint, package, test, typecheck
- `apps/watcher` nestjs; entry: `apps/watcher/src/main.ts`; commands: build, dev:fixture, lint, start, test, typecheck
- `apps/web` next; entry: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`; commands: build, dev, lint, start, typecheck
- `packages/core` nestjs; entry: none; commands: build, lint, prisma:generate, prisma:migrate:deploy, test, typecheck
- `packages/eslint-config` node; entry: none; commands: none
- `packages/hyperframes` node; entry: `packages/hyperframes/dist/index.js`, `packages/hyperframes/src/index.ts`; commands: build, typecheck
- `packages/shared` node; entry: none; commands: build, lint, test, typecheck
- `packages/toolbox` node; entry: `packages/toolbox/dist/cli.js`, `packages/toolbox/src/cli.ts`; commands: ace, build, test, typecheck
- ... 4 more in index.json

## Modules (129)

- `apps`
- `apps/api/src/auth`
- `apps/api/src/catalog`
- `apps/api/src/comparisons`
- `apps/api/src/connections`
- `apps/api/src/curations`
- `apps/api/src/health`
- `apps/api/src/insights`
- `apps/api/src/logging`
- `apps/api/src/metrics`
- `apps/api/src/platform`
- `apps/api/src/publishing`
- `apps/api/src/recipes`
- `apps/api/src/runs`
- `apps/api/src/schedules`
- `apps/api/src/search`
- `apps/api/src/watcher`
- `apps/shell/src/actions`
- `apps/shell/src/cli` - The one switch the shell accepts; the uninstaller runs the app with it to remove the login item.
- `apps/shell/src/config`
- `apps/shell/src/controller`
- `apps/shell/src/electron`
- `apps/shell/src/logging`
- `apps/shell/src/menu` - qua., 25/11 09:00 : weekday, day/month and 24-hour time.
- `apps/shell/src/platform` - Narrows a thrown Node error to its code without trusting its shape.
- `apps/shell/src/state`
- `apps/shell/src/test-support`
- `apps/watcher/src/adapters`
- `apps/watcher/src/curation`
- `apps/watcher/src/daemon` - Error taxonomy category rules/observability.md , as in engine.errors.ts .
- `apps/watcher/src/dev`
- `apps/watcher/src/engine` - Injected time source rules/architecture.md: inject the clock , so tests can fix instants.
- `apps/watcher/src/hyperframes-runtime`
- `apps/watcher/src/mocks`
- `apps/watcher/src/platform` - True when a thrown Node error carries this code ENOENT , ELOOP , ... , without trusting its shape.
- `apps/watcher/src/platforms`
- `apps/watcher/src/schedules`
- `apps/watcher/src/stages`
- `apps/web/src/app`
- `apps/web/src/features`
- ... 89 more in index.json

## Routes (83)

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
- `PAGE /` in `apps/web/src/app/page.tsx`
- `POST /` in `apps/api/src/catalog/catalog.controller.ts`
- `POST /` in `apps/api/src/comparisons/comparisons.controller.ts`
- `POST /` in `apps/api/src/curations/curations.controller.ts`
- `POST /` in `apps/api/src/metrics/metric-imports.controller.ts`
- `POST /` in `apps/api/src/recipes/recipes.controller.ts`
- `POST /` in `apps/api/src/runs/runs.controller.ts`
- `POST /` in `apps/api/src/schedules/schedules.controller.ts`
- `POST /` in `apps/api/src/search/search.controller.ts`
- ... 63 more in index.json

## Data models and migrations (24)

- migration `migration` in `packages/core/prisma/migrations/20261118000000_init/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261118120000_r2_improvement_loop/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261118180000_curator/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261119120000_r3_outside_signals/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261119130000_r3_promotion_platform_sample/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261120120000_r4_connected_platforms/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261120180000_r4_publish_metadata_hash/migration.sql`
- schema `Asset` in `packages/core/prisma/schema.prisma`
- schema `AssetLearningNote` in `packages/core/prisma/schema.prisma`
- schema `AssetVersion` in `packages/core/prisma/schema.prisma`
- schema `Comparison` in `packages/core/prisma/schema.prisma`
- schema `CostEntry` in `packages/core/prisma/schema.prisma`
- schema `CurationDecision` in `packages/core/prisma/schema.prisma`
- schema `MetricImport` in `packages/core/prisma/schema.prisma`
- schema `PlatformMetricSnapshot` in `packages/core/prisma/schema.prisma`
- ... 9 more in index.json

## Environment variable names (3)

- `ENGINEOS_VIDEO_CREATOR_API_ORIGIN` from `apps/web/.env.example`
- `ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN` from `apps/web/.env.example`
- `ENGINEOS_VIDEO_CREATOR_WEB_PORT` from `apps/web/.env.example`

## Test locations (75)

- `.engineos/archived/2026/11/test`
- `apps/api/src/auth`
- `apps/api/src/catalog`
- `apps/api/src/connections`
- `apps/api/src/metrics`
- `apps/api/src/platform`
- `apps/api/src/publishing`
- `apps/api/src/runs`
- `apps/api/src/schedules`
- `apps/shell/src/actions`
- ... 65 more in index.json

## Conventions (8)

- colocated-tests (`apps/api/src/auth/rev7-routes.guard.test.ts`)
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
