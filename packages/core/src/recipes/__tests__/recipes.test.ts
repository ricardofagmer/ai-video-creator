import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Module, type INestApplicationContext, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CqrsModule, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { recipeContentHashInput, type Recipe } from '@studio/shared/recipes';
import { ContentStore, ReferenceInspector, sha256Hex } from '../../asset-store';
import { CreateAssetCommand, GetAssetVersionQuery } from '../../catalog';
import { AssetContentService } from '../../catalog/asset-content';
import { AssetVersionRepository } from '../../catalog/asset-version.repository';
import { BiometricSourceGuard } from '../../catalog/biometric-source.guard';
import { CreateAssetHandler } from '../../catalog/commands/create-asset.handler';
import { HyperframesTemplateCheck } from '../../catalog/hyperframes-template.check';
import { GetAssetVersionHandler } from '../../catalog/queries/get-asset-version.handler';
import { PrismaBiometricReferenceSource } from '../../redaction/biometric-reference.source';
import { createCoverageHome, fixtures, type CoverageHome, type RecipeFixture } from '../../test-support';
import {
  CreateRecipeCommand,
  GetRecipeVersionQuery,
  InvalidRecipeInputError,
  InvalidRecipeStatusTransitionError,
  ListRecipeVersionsQuery,
  RecipeAlreadyExistsError,
  RecipeBindingInvalidError,
  RecipeBindingVerifier,
  RecipeNotFoundError,
  RecipeVersionNotFoundError,
  SaveRecipeVersionCommand,
  SetRecipeStatusCommand,
  hashRecipeDefinition,
} from '..';
import { CreateRecipeHandler } from '../commands/create-recipe.handler';
import { SaveRecipeVersionHandler } from '../commands/save-recipe-version.handler';
import { PromotionApprovalRequiredError } from '../commands/set-recipe-status.errors';
import { SetRecipeStatusHandler } from '../commands/set-recipe-status.handler';
import { GetRecipeVersionHandler } from '../queries/get-recipe-version.handler';
import { ListRecipeVersionsHandler } from '../queries/list-recipe-versions.handler';
import { RecipeVersionRepository } from '../recipe-version.repository';

/*
 * Ticket 07 (recipes): the real recipe handlers; the binding verifier asks the catalog through a
 * real CQRS query bus whose only handler is the real catalog read handler over the same database.
 * Handlers are registered as zero-argument subclasses because tsx emits no constructor metadata.
 */

@Module({})
class RecipesCoverageModule {}

function catalogReadHandler(versions: AssetVersionRepository): Type<GetAssetVersionHandler> {
  @QueryHandler(GetAssetVersionQuery)
  class ScopedGetAssetVersionHandler extends GetAssetVersionHandler {
    constructor() {
      super(versions);
    }
  }
  return ScopedGetAssetVersionHandler;
}

interface RecipesUnderTest {
  app: INestApplicationContext;
  createAsset: CreateAssetHandler;
  create: CreateRecipeHandler;
  save: SaveRecipeVersionHandler;
  setStatus: SetRecipeStatusHandler;
  get: GetRecipeVersionHandler;
  list: ListRecipeVersionsHandler;
}

async function recipesOf(home: CoverageHome): Promise<RecipesUnderTest> {
  const assetVersions = new AssetVersionRepository(home.prisma);
  const store = new ContentStore(home.dataHome);
  const content = new AssetContentService(
    store,
    new ReferenceInspector(home.dataHome),
    new BiometricSourceGuard(new PrismaBiometricReferenceSource(home.prisma)),
  );
  const app = await NestFactory.createApplicationContext(
    { module: RecipesCoverageModule, imports: [CqrsModule.forRoot()], providers: [catalogReadHandler(assetVersions)] },
    { logger: false, abortOnError: false },
  );
  const bindings = new RecipeBindingVerifier(app.get(QueryBus));
  const recipeVersions = new RecipeVersionRepository(home.prisma);
  return {
    app,
    createAsset: new CreateAssetHandler(home.prisma, assetVersions, content, new HyperframesTemplateCheck(store)),
    create: new CreateRecipeHandler(home.prisma, recipeVersions, bindings),
    save: new SaveRecipeVersionHandler(home.prisma, recipeVersions, bindings),
    setStatus: new SetRecipeStatusHandler(home.prisma, recipeVersions),
    get: new GetRecipeVersionHandler(recipeVersions),
    list: new ListRecipeVersionsHandler(recipeVersions),
  };
}

function refOf(version: AssetVersion): string {
  return formatAssetRef({ assetId: version.id, version: version.version });
}

/** The fixture recipe with one binding, `prompt:writer`, pinned to `asset` with `contentHash`. */
function recipeBoundTo(asset: AssetVersion, contentHash: string = asset.contentHash): RecipeFixture {
  const base = fixtures.recipe();
  return { ...base, definition: { ...base.definition, bindings: [{ slot: 'prompt:writer', ref: refOf(asset), contentHash }] } };
}

/** The fixture recipe with no bindings, for cases about the recipe alone. */
function unboundRecipe(): RecipeFixture {
  const base = fixtures.recipe();
  return { ...base, definition: { ...base.definition, bindings: [] } };
}

describe('recipes (ticket 07)', () => {
  let home: CoverageHome;
  let recipes: RecipesUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-recipes', start: new Date('2026-11-21T10:00:00.000Z') });
    recipes = await recipesOf(home);
  });

  afterEach(async () => {
    await recipes.app.close();
    await home.close();
  });

  describe('recipeContentHashInput', () => {
    it('ignores status and timestamps', async () => {
      const created = await recipes.create.execute(new CreateRecipeCommand(unboundRecipe()));
      const recipe: Recipe = created.recipe;

      const relabelled: Recipe = { ...recipe, status: 'deprecated', createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-02-01T00:00:00.000Z' };

      assert.equal(recipeContentHashInput(relabelled), recipeContentHashInput(recipe));
      const parsed: unknown = JSON.parse(recipeContentHashInput(recipe));
      assert.ok(typeof parsed === 'object' && parsed !== null);
      assert.equal('status' in parsed, false);
      assert.equal('createdAt' in parsed, false);
      assert.equal('updatedAt' in parsed, false);
    });

    it('keeps the version, so version 2 of the same definition hashes differently', async () => {
      const created = await recipes.create.execute(new CreateRecipeCommand(unboundRecipe()));
      const recipe: Recipe = created.recipe;

      const nextVersion: Recipe = { ...recipe, version: recipe.version + 1 };

      assert.notEqual(recipeContentHashInput(nextVersion), recipeContentHashInput(recipe));
      const parsed: unknown = JSON.parse(recipeContentHashInput(recipe));
      assert.ok(typeof parsed === 'object' && parsed !== null && 'version' in parsed);
      assert.equal(parsed.version, 1);
    });

    it('is the exact text whose sha-256 is the stored content hash', async () => {
      const created = await recipes.create.execute(new CreateRecipeCommand(unboundRecipe()));

      assert.equal(sha256Hex(recipeContentHashInput(created.recipe)), created.contentHash);
      assert.equal(hashRecipeDefinition(created.recipe).contentHash, created.contentHash);
    });
  });

  describe('versions and bindings', () => {
    it('creates a draft version 1 pinned to the catalog version it binds', async () => {
      const asset = await recipes.createAsset.execute(new CreateAssetCommand(fixtures.asset()));
      const input = recipeBoundTo(asset);

      const created = await recipes.create.execute(new CreateRecipeCommand(input));
      const read = await recipes.get.execute(new GetRecipeVersionQuery(created.ref));

      assert.equal(created.ref, `${input.recipeId}@1`);
      assert.equal(created.recipe.status, 'draft');
      assert.deepEqual(read.recipe.bindings, [{ slot: 'prompt:writer', ref: refOf(asset), contentHash: asset.contentHash }]);
    });

    it('saves version 2 and lists both versions', async () => {
      const input = unboundRecipe();
      await recipes.create.execute(new CreateRecipeCommand(input));

      const saved = await recipes.save.execute(
        new SaveRecipeVersionCommand({ recipeId: input.recipeId, definition: { ...input.definition, notes: 'second version' } }),
      );
      const page = await recipes.list.execute(new ListRecipeVersionsQuery({ recipeId: input.recipeId }));

      assert.equal(saved.recipe.version, 2);
      assert.equal(page.total, 2);
    });

    it('keeps the content hash when a version is deprecated', async () => {
      const created = await recipes.create.execute(new CreateRecipeCommand(unboundRecipe()));

      const changed = await recipes.setStatus.execute(new SetRecipeStatusCommand({ ref: created.ref, status: 'deprecated' }));

      assert.equal(changed.version.recipe.status, 'deprecated');
      assert.equal(changed.version.contentHash, created.contentHash);
    });
  });

  describe('typed errors', () => {
    it('refuses a binding whose hash differs from the catalog version', async () => {
      const asset = await recipes.createAsset.execute(new CreateAssetCommand(fixtures.asset()));

      await assert.rejects(recipes.create.execute(new CreateRecipeCommand(recipeBoundTo(asset, 'a'.repeat(64)))), (error: unknown) => {
        assert.ok(error instanceof RecipeBindingInvalidError);
        assert.deepEqual(error.problems, [{ slot: 'prompt:writer', ref: refOf(asset), problem: 'hash-differs' }]);
        return true;
      });
    });

    it('refuses bindings to catalog versions that do not exist', async () => {
      await assert.rejects(recipes.create.execute(new CreateRecipeCommand(fixtures.recipe())), (error: unknown) => {
        assert.ok(error instanceof RecipeBindingInvalidError);
        assert.ok(error.problems.length > 0);
        assert.ok(error.problems.every((problem) => problem.problem === 'unknown-asset-version'));
        return true;
      });
    });

    it('refuses a second recipe with the same id', async () => {
      const input = unboundRecipe();
      await recipes.create.execute(new CreateRecipeCommand(input));

      await assert.rejects(recipes.create.execute(new CreateRecipeCommand(input)), RecipeAlreadyExistsError);
    });

    it('answers RecipeNotFoundError when saving a version of an unknown recipe', async () => {
      const input = unboundRecipe();

      await assert.rejects(recipes.save.execute(new SaveRecipeVersionCommand(input)), RecipeNotFoundError);
    });

    it('answers RecipeVersionNotFoundError for an unknown ref', async () => {
      await assert.rejects(recipes.get.execute(new GetRecipeVersionQuery('coverage-missing-recipe@1')), RecipeVersionNotFoundError);
    });

    it('refuses a recipe id outside the kebab-case pattern', async () => {
      await assert.rejects(recipes.create.execute(new CreateRecipeCommand({ ...unboundRecipe(), recipeId: 'Not A Recipe Id' })), InvalidRecipeInputError);
    });

    it('refuses activation through the status command and leaves the version a draft', async () => {
      const created = await recipes.create.execute(new CreateRecipeCommand(unboundRecipe()));

      await assert.rejects(
        recipes.setStatus.execute(new SetRecipeStatusCommand({ ref: created.ref, status: 'active' })),
        PromotionApprovalRequiredError,
      );
      const after = await recipes.get.execute(new GetRecipeVersionQuery(created.ref));
      assert.equal(after.recipe.status, 'draft');
    });

    it('refuses moving a deprecated version back to draft', async () => {
      const created = await recipes.create.execute(new CreateRecipeCommand(unboundRecipe()));
      await recipes.setStatus.execute(new SetRecipeStatusCommand({ ref: created.ref, status: 'deprecated' }));

      await assert.rejects(
        recipes.setStatus.execute(new SetRecipeStatusCommand({ ref: created.ref, status: 'draft' })),
        InvalidRecipeStatusTransitionError,
      );
    });
  });
});
