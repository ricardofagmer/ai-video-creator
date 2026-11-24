import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Module, type INestApplicationContext, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CqrsModule, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { newRunId, readRunFile, runDirectory, writeRunFile } from '@studio/shared/run-files';
import { type Brief } from '@studio/shared/recipes';
import { GetAssetVersionQuery } from '../../catalog';
import { AssetVersionRepository } from '../../catalog/asset-version.repository';
import { GetAssetVersionHandler } from '../../catalog/queries/get-asset-version.handler';
import {
  CreateRecipeCommand,
  GetRecipeVersionQuery,
  RecipeBindingVerifier,
  SetRecipeStatusCommand,
  type RecipeVersionView,
} from '../../recipes';
import { CreateRecipeHandler } from '../../recipes/commands/create-recipe.handler';
import { SetRecipeStatusHandler } from '../../recipes/commands/set-recipe-status.handler';
import { GetRecipeVersionHandler } from '../../recipes/queries/get-recipe-version.handler';
import { RecipeVersionRepository } from '../../recipes/recipe-version.repository';
import { createCoverageHome, fixtures, type CoverageHome } from '../../test-support';
import {
  BriefInputsMissingError,
  InvalidRunInputError,
  ListRunsQuery,
  RecipeNotRunnableError,
  RunNotFoundError,
  RunReferenceNotFoundError,
  RunStatusConflictError,
  SyncRunIndexCommand,
} from '..';
import { SyncRunIndexHandler } from '../commands/sync-run-index.handler';
import { ListRunsHandler } from '../queries/list-runs.handler';
import { RunDraftService } from '../run-draft.service';
import { RunIndexRepository } from '../run-index.repository';
import { RunIndexService } from '../run-index.service';

/*
 * Ticket 07 (runs): the real draft service and run index over the coverage temp home. Recipe and
 * catalog reads go through a real CQRS query bus whose handlers are the real read handlers over the
 * same database, registered as zero-argument subclasses (tsx emits no constructor metadata).
 */

@Module({})
class RunsCoverageModule {}

function readHandlers(assets: AssetVersionRepository, recipes: RecipeVersionRepository): Type<object>[] {
  @QueryHandler(GetAssetVersionQuery)
  class ScopedGetAssetVersionHandler extends GetAssetVersionHandler {
    constructor() {
      super(assets);
    }
  }
  @QueryHandler(GetRecipeVersionQuery)
  class ScopedGetRecipeVersionHandler extends GetRecipeVersionHandler {
    constructor() {
      super(recipes);
    }
  }
  return [ScopedGetAssetVersionHandler, ScopedGetRecipeVersionHandler];
}

interface RunsUnderTest {
  app: INestApplicationContext;
  drafts: RunDraftService;
  index: RunIndexService;
  list: ListRunsHandler;
  sync: SyncRunIndexHandler;
  createRecipe: CreateRecipeHandler;
  setRecipeStatus: SetRecipeStatusHandler;
}

async function runsOf(home: CoverageHome): Promise<RunsUnderTest> {
  const recipeVersions = new RecipeVersionRepository(home.prisma);
  const app = await NestFactory.createApplicationContext(
    { module: RunsCoverageModule, imports: [CqrsModule.forRoot()], providers: readHandlers(new AssetVersionRepository(home.prisma), recipeVersions) },
    { logger: false, abortOnError: false },
  );
  const queryBus = app.get(QueryBus);
  const bindings = new RecipeBindingVerifier(queryBus);
  const entries = new RunIndexRepository(home.prisma);
  const index = new RunIndexService(home.dataHome, entries);
  return {
    app,
    drafts: new RunDraftService(queryBus, bindings, home.dataHome, index),
    index,
    list: new ListRunsHandler(entries),
    sync: new SyncRunIndexHandler(home.dataHome, index),
    createRecipe: new CreateRecipeHandler(home.prisma, recipeVersions, bindings),
    setRecipeStatus: new SetRecipeStatusHandler(home.prisma, recipeVersions),
  };
}

/** The fixture recipe without bindings, saved as a draft (a runnable status). */
async function runnableRecipe(runs: RunsUnderTest): Promise<RecipeVersionView> {
  const base = fixtures.recipe();
  return runs.createRecipe.execute(new CreateRecipeCommand({ ...base, definition: { ...base.definition, bindings: [] } }));
}

function fixtureBrief(): Brief {
  return fixtures.run().run.brief;
}

describe('runs (ticket 07)', () => {
  let home: CoverageHome;
  let runs: RunsUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-runs', start: new Date('2026-11-21T10:00:00.000Z') });
    runs = await runsOf(home);
  });

  afterEach(async () => {
    await runs.app.close();
    await home.close();
  });

  describe('draft and pending', () => {
    it('creates a draft run.json pinned to the recipe version and mirrors it into the index', async () => {
      const recipe = await runnableRecipe(runs);

      const result = await runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'cli' });
      const onDisk = await readRunFile(runDirectory(home.dataHome.runs, result.run.runId));

      assert.equal(result.index, 'synced');
      assert.equal(onDisk.state.status, 'draft');
      assert.equal(onDisk.recipe.ref, recipe.ref);
      assert.equal(onDisk.recipe.contentHash, recipe.contentHash);
    });

    it('moves a draft to pending and answers the same run when asked again', async () => {
      const recipe = await runnableRecipe(runs);
      const created = await runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'cli' });

      const first = await runs.drafts.markPending(created.run.runId);
      const second = await runs.drafts.markPending(created.run.runId);

      assert.equal(first.run.state.status, 'pending');
      assert.deepEqual(second.run.state, first.run.state);
    });

    it('lists an indexed run with its current status', async () => {
      const recipe = await runnableRecipe(runs);
      const created = await runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'cli' });
      await runs.drafts.markPending(created.run.runId);

      const page = await runs.list.execute(new ListRunsQuery({}));

      assert.deepEqual(
        page.items.map((entry) => [entry.runId, entry.status]),
        [[created.run.runId, 'pending']],
      );
    });
  });

  describe('run index', () => {
    it('rebuilds from run folders and reports an unreadable run.json without failing', async () => {
      const recipe = await runnableRecipe(runs);
      const created = await runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'cli' });
      const brokenRunId = newRunId();
      const brokenDir = runDirectory(home.dataHome.runs, brokenRunId);
      await mkdir(brokenDir, { recursive: true });
      await writeFile(join(brokenDir, 'run.json'), 'not json', 'utf8');

      const report = await runs.index.rebuild();

      assert.equal(report.indexed, 1);
      assert.deepEqual(
        report.unreadable.map((problem) => problem.runId),
        [brokenRunId],
      );
      assert.equal(report.orphaned.includes(created.run.runId), false);
    });

    it('answers RunNotFoundError when syncing a run that has no folder', async () => {
      await assert.rejects(runs.sync.execute(new SyncRunIndexCommand(newRunId())), RunNotFoundError);
    });
  });

  describe('typed errors', () => {
    it('refuses a run of a deprecated recipe', async () => {
      const recipe = await runnableRecipe(runs);
      await runs.setRecipeStatus.execute(new SetRecipeStatusCommand({ ref: recipe.ref, status: 'deprecated' }));

      await assert.rejects(runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'cli' }), RecipeNotRunnableError);
    });

    it('refuses a brief without the inputs the recipe requires', async () => {
      const recipe = await runnableRecipe(runs);
      const brief: Brief = { ...fixtureBrief() };
      delete brief.sourceUrl;

      await assert.rejects(runs.drafts.create({ recipeRef: recipe.ref, brief, createdBy: 'cli' }), BriefInputsMissingError);
    });

    it('refuses a reference that the catalog does not hold', async () => {
      const recipe = await runnableRecipe(runs);

      await assert.rejects(
        runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'cli', references: ['coverage-missing@1'] }),
        (error: unknown) => {
          assert.ok(error instanceof RunReferenceNotFoundError);
          assert.deepEqual(error.refs, ['coverage-missing@1']);
          return true;
        },
      );
    });

    it('refuses a watcher-created run without its schedule link', async () => {
      const recipe = await runnableRecipe(runs);

      await assert.rejects(runs.drafts.create({ recipeRef: recipe.ref, brief: fixtureBrief(), createdBy: 'watcher' }), InvalidRunInputError);
    });

    it('answers RunNotFoundError when marking an unknown run pending', async () => {
      await assert.rejects(runs.drafts.markPending(newRunId()), RunNotFoundError);
    });

    it('refuses to move a decided run back to pending', async () => {
      const reviewed = fixtures.reviewedRun(4);
      await writeRunFile(runDirectory(home.dataHome.runs, reviewed.run.runId), reviewed.run);

      await assert.rejects(runs.drafts.markPending(reviewed.run.runId), RunStatusConflictError);
    });
  });
});
