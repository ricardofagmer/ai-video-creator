# Project Index

Generated facts at commit `ecbdc4c2d628` (2026-11-19T16:44:48.499Z). Detail and sources: [index.json](index.json).
Regenerate with `engineos index refresh`. Narrative and rationale live in the docs linked at the end.

## Start here (5)

- add or change an HTTP route or page: `apps/api/src/catalog`, `apps/api/src/comparisons`, `apps/api/src/curations`, `apps/api/src/health`, `apps/api/src/recipes`
- change CI or build conventions: `apps/api/eslint.config.mjs`, `apps/api/src/app.module.ts`, `apps/api/tsconfig.build.json`, `packages/core/prisma/schema.prisma`, `pnpm-workspace.yaml`
- change a data model or migration: `packages/core/prisma`, `packages/core/prisma/migrations/20261118000000_init`, `packages/core/prisma/migrations/20261118120000_r2_improvement_loop`, `packages/core/prisma/migrations/20261118180000_curator`, `packages/core/prisma/migrations/20261119120000_r3_outside_signals`
- change a package command or entry point: `apps/api/package.json`, `apps/watcher/package.json`, `apps/web/package.json`, `package.json`, `packages/core/package.json`
- change environment configuration: `apps/web/.env.example`

## Packages (12)

- `.` node; entry: none; commands: ace, build, dev, lint, test, typecheck
- `apps/api` nestjs; entry: `apps/api/src/main.ts`; commands: build, lint, start, test, typecheck
- `apps/watcher` nestjs; entry: `apps/watcher/src/main.ts`; commands: build, dev:fixture, lint, start, test, typecheck
- `apps/web` next; entry: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`; commands: build, dev, lint, start, typecheck
- `packages/core` nestjs; entry: none; commands: build, lint, prisma:generate, prisma:migrate:deploy, test, typecheck
- `packages/eslint-config` node; entry: none; commands: none
- `packages/shared` node; entry: none; commands: build, lint, test, typecheck
- `packages/toolbox` node; entry: `packages/toolbox/dist/cli.js`, `packages/toolbox/src/cli.ts`; commands: ace, build, typecheck
- `packages/tsconfig` node; entry: none; commands: none
- `packages/ui` react; entry: `packages/ui/src/index.ts`; commands: build, lint, typecheck
- ... 2 more in index.json

## Modules (97)

- `apps`
- `apps/api/src/auth`
- `apps/api/src/catalog`
- `apps/api/src/comparisons`
- `apps/api/src/curations`
- `apps/api/src/health`
- `apps/api/src/logging`
- `apps/api/src/platform`
- `apps/api/src/recipes`
- `apps/api/src/search`
- `apps/api/src/watcher`
- `apps/watcher/src/adapters`
- `apps/watcher/src/curation`
- `apps/watcher/src/daemon` - Error taxonomy category rules/observability.md , as in engine.errors.ts .
- `apps/watcher/src/dev`
- `apps/watcher/src/engine` - Injected time source rules/architecture.md: inject the clock , so tests can fix instants.
- `apps/watcher/src/mocks`
- `apps/watcher/src/platform` - The error's class name for a log field.
- `apps/watcher/src/stages`
- `apps/web/src/app`
- `apps/web/src/features`
- `apps/web/src/lib`
- `design` - Referência de design do Video Studio
- `docs`
- `packages`
- `packages/core/src/agents`
- `packages/core/src/asset-store` - Error taxonomy category rules/observability.md ; the api maps it to a status code.
- `packages/core/src/catalog`
- `packages/core/src/comparisons`
- `packages/core/src/costs`
- `packages/core/src/curation`
- `packages/core/src/embeddings`
- `packages/core/src/learnings`
- `packages/core/src/metrics`
- `packages/core/src/outcomes`
- `packages/core/src/paths`
- `packages/core/src/prisma`
- `packages/core/src/promotion`
- `packages/core/src/providers`
- `packages/core/src/quality`
- ... 57 more in index.json

## Routes (51)

- `GET /` in `apps/api/src/catalog/catalog.controller.ts`
- `GET /` in `apps/api/src/comparisons/comparisons.controller.ts`
- `GET /` in `apps/api/src/curations/curations.controller.ts`
- `GET /` in `apps/api/src/health/health.controller.ts`
- `GET /` in `apps/api/src/recipes/recipes.controller.ts`
- `GET /` in `apps/api/src/watcher/watcher.controller.ts`
- `PAGE /` in `apps/web/src/app/page.tsx`
- `POST /` in `apps/api/src/catalog/catalog.controller.ts`
- `POST /` in `apps/api/src/comparisons/comparisons.controller.ts`
- `POST /` in `apps/api/src/curations/curations.controller.ts`
- `POST /` in `apps/api/src/recipes/recipes.controller.ts`
- `POST /` in `apps/api/src/search/search.controller.ts`
- `GET /:assetId/versions` in `apps/api/src/catalog/catalog.controller.ts`
- `POST /:assetId/versions` in `apps/api/src/catalog/catalog.controller.ts`
- `POST /:assetId/versions/${apiRouteSegments.byReference}` in `apps/api/src/catalog/catalog.controller.ts`
- `GET /:assetId/versions/:version` in `apps/api/src/catalog/catalog.controller.ts`
- `PUT /:assetId/versions/:version/${apiRouteSegments.learnings}/:noteId/status` in `apps/api/src/catalog/catalog-version-decisions.controller.ts`
- `POST /:assetId/versions/:version/${apiRouteSegments.promotion}` in `apps/api/src/catalog/catalog-version-decisions.controller.ts`
- `PUT /:assetId/versions/:version/status` in `apps/api/src/catalog/catalog.controller.ts`
- `POST /:assetId/versions/from-previous` in `apps/api/src/catalog/catalog.controller.ts`
- ... 31 more in index.json

## Data models and migrations (20)

- migration `migration` in `packages/core/prisma/migrations/20261118000000_init/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261118120000_r2_improvement_loop/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261118180000_curator/migration.sql`
- migration `migration` in `packages/core/prisma/migrations/20261119120000_r3_outside_signals/migration.sql`
- schema `Asset` in `packages/core/prisma/schema.prisma`
- schema `AssetLearningNote` in `packages/core/prisma/schema.prisma`
- schema `AssetVersion` in `packages/core/prisma/schema.prisma`
- schema `Comparison` in `packages/core/prisma/schema.prisma`
- schema `CostEntry` in `packages/core/prisma/schema.prisma`
- schema `CurationDecision` in `packages/core/prisma/schema.prisma`
- schema `MetricImport` in `packages/core/prisma/schema.prisma`
- schema `PlatformMetricSnapshot` in `packages/core/prisma/schema.prisma`
- schema `PromotionApproval` in `packages/core/prisma/schema.prisma`
- schema `Recipe` in `packages/core/prisma/schema.prisma`
- schema `RecipeVersion` in `packages/core/prisma/schema.prisma`
- ... 5 more in index.json

## Environment variable names (3)

- `VIDEO_STUDIO_API_ORIGIN` from `apps/web/.env.example`
- `VIDEO_STUDIO_WEB_ORIGIN` from `apps/web/.env.example`
- `VIDEO_STUDIO_WEB_PORT` from `apps/web/.env.example`

## Conventions (6)

- eslint (`apps/api/eslint.config.mjs`)
- nestjs-modules (`apps/api/src/app.module.ts`)
- pnpm-workspace (`pnpm-workspace.yaml`)
- prisma (`packages/core/prisma/schema.prisma`)
- turborepo (`turbo.json`)
- typescript (`apps/api/tsconfig.build.json`)

## Docs (4)

- [docs/RUN-FORMAT.md](../../docs/RUN-FORMAT.md)
- [docs/adr/](../../docs/adr/)
- [docs/prds/](../../docs/prds/)
- [docs/specs/](../../docs/specs/)
