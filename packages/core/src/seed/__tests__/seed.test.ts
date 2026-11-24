import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Module, type INestApplicationContext, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, CommandHandler, CqrsModule, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { ContentStore, ReferenceInspector } from '../../asset-store';
import { CreateAssetCommand, GetAssetVersionQuery, ListAssetVersionsQuery, SaveAssetVersionCommand } from '../../catalog';
import { AssetContentService } from '../../catalog/asset-content';
import { AssetVersionRepository } from '../../catalog/asset-version.repository';
import { BiometricSourceGuard } from '../../catalog/biometric-source.guard';
import { CreateAssetHandler } from '../../catalog/commands/create-asset.handler';
import { SaveAssetVersionHandler } from '../../catalog/commands/save-asset-version.handler';
import { HyperframesTemplateCheck } from '../../catalog/hyperframes-template.check';
import { GetAssetVersionHandler } from '../../catalog/queries/get-asset-version.handler';
import { ListAssetVersionsHandler } from '../../catalog/queries/list-asset-versions.handler';
import { CreateRecipeCommand, GetRecipeVersionQuery, ListRecipeVersionsQuery, RecipeBindingVerifier, SaveRecipeVersionCommand } from '../../recipes';
import { CreateRecipeHandler } from '../../recipes/commands/create-recipe.handler';
import { SaveRecipeVersionHandler } from '../../recipes/commands/save-recipe-version.handler';
import { GetRecipeVersionHandler } from '../../recipes/queries/get-recipe-version.handler';
import { ListRecipeVersionsHandler } from '../../recipes/queries/list-recipe-versions.handler';
import { RecipeVersionRepository } from '../../recipes/recipe-version.repository';
import { PrismaBiometricReferenceSource } from '../../redaction/biometric-reference.source';
import { createCoverageHome, fixtures, type CoverageHome } from '../../test-support';
import {
  SEED_MANIFEST_RELATIVE_PATH,
  SeedCatalogCommand,
  SeedManifestInvalidError,
  SeedSourceMissingError,
  SeedSourceRootInvalidError,
  type SeedEntryResult,
  type SeedReport,
} from '..';
import { AssetSeeder } from '../asset-seeder';
import { SeedCatalogHandler } from '../commands/seed-catalog.handler';
import { RecipeSeeder } from '../recipe-seeder';
import { SeedSettings } from '../seed-source';

/*
 * Ticket 07 (seed): the real seed handler, asset seeder and recipe seeder over the coverage temp
 * home. The seed source root is synthetic and lives inside the temp home (OQ1: the real catalog
 * seed is owner-run). Catalog and recipe handlers are the real ones on real CQRS buses, registered
 * as zero-argument subclasses because tsx emits no constructor metadata. The recipe binding
 * verifier reads the catalog through a second, read-only context so the seed context has no cycle.
 */

const SEEDS_FOLDER = 'video-studio/seeds';
const PROMPTS_FOLDER = `${SEEDS_FOLDER}/prompts`;
const RECIPES_FOLDER = `${SEEDS_FOLDER}/recipes`;
const BRAND_ASSET_ID = 'coverage-seed-brand';
const PROMPT_ASSET_ID = 'coverage-seed-writer';
const PROMPT_FILE = 'coverage-writer.prompt.json';
const RECIPE_FILE = 'coverage-seed.recipe.json';

@Module({})
class SeedCatalogReadModule {}

@Module({})
class SeedCoverageModule {}

interface HandlerDependencies {
  home: CoverageHome;
  assetVersions: AssetVersionRepository;
  recipeVersions: RecipeVersionRepository;
  content: AssetContentService;
  hyperframes: HyperframesTemplateCheck;
}

function catalogReadHandler(versions: AssetVersionRepository): Type<object> {
  @QueryHandler(GetAssetVersionQuery)
  class ScopedGetAssetVersionHandler extends GetAssetVersionHandler {
    constructor() {
      super(versions);
    }
  }
  return ScopedGetAssetVersionHandler;
}

function seedBusHandlers(dependencies: HandlerDependencies, bindings: RecipeBindingVerifier): Type<object>[] {
  const { home, assetVersions, recipeVersions, content, hyperframes } = dependencies;
  @CommandHandler(CreateAssetCommand)
  class ScopedCreateAssetHandler extends CreateAssetHandler {
    constructor() {
      super(home.prisma, assetVersions, content, hyperframes);
    }
  }
  @CommandHandler(SaveAssetVersionCommand)
  class ScopedSaveAssetVersionHandler extends SaveAssetVersionHandler {
    constructor() {
      super(home.prisma, assetVersions, content, hyperframes);
    }
  }
  @QueryHandler(ListAssetVersionsQuery)
  class ScopedListAssetVersionsHandler extends ListAssetVersionsHandler {
    constructor() {
      super(assetVersions);
    }
  }
  @CommandHandler(CreateRecipeCommand)
  class ScopedCreateRecipeHandler extends CreateRecipeHandler {
    constructor() {
      super(home.prisma, recipeVersions, bindings);
    }
  }
  @CommandHandler(SaveRecipeVersionCommand)
  class ScopedSaveRecipeVersionHandler extends SaveRecipeVersionHandler {
    constructor() {
      super(home.prisma, recipeVersions, bindings);
    }
  }
  @QueryHandler(ListRecipeVersionsQuery)
  class ScopedListRecipeVersionsHandler extends ListRecipeVersionsHandler {
    constructor() {
      super(recipeVersions);
    }
  }
  @QueryHandler(GetRecipeVersionQuery)
  class ScopedGetRecipeVersionHandler extends GetRecipeVersionHandler {
    constructor() {
      super(recipeVersions);
    }
  }
  return [
    catalogReadHandler(assetVersions),
    ScopedCreateAssetHandler,
    ScopedSaveAssetVersionHandler,
    ScopedListAssetVersionsHandler,
    ScopedCreateRecipeHandler,
    ScopedSaveRecipeVersionHandler,
    ScopedListRecipeVersionsHandler,
    ScopedGetRecipeVersionHandler,
  ];
}

interface SeedUnderTest {
  contexts: INestApplicationContext[];
  seed: SeedCatalogHandler;
}

async function seedOf(home: CoverageHome, sourceRoot: string): Promise<SeedUnderTest> {
  const assetVersions = new AssetVersionRepository(home.prisma);
  const store = new ContentStore(home.dataHome);
  const references = new ReferenceInspector(home.dataHome);
  const content = new AssetContentService(store, references, new BiometricSourceGuard(new PrismaBiometricReferenceSource(home.prisma)));
  const catalogRead = await NestFactory.createApplicationContext(
    { module: SeedCatalogReadModule, imports: [CqrsModule.forRoot()], providers: [catalogReadHandler(assetVersions)] },
    { logger: false, abortOnError: false },
  );
  const bindings = new RecipeBindingVerifier(catalogRead.get(QueryBus));
  const dependencies: HandlerDependencies = {
    home,
    assetVersions,
    recipeVersions: new RecipeVersionRepository(home.prisma),
    content,
    hyperframes: new HyperframesTemplateCheck(store),
  };
  const app = await NestFactory.createApplicationContext(
    { module: SeedCoverageModule, imports: [CqrsModule.forRoot()], providers: seedBusHandlers(dependencies, bindings) },
    { logger: false, abortOnError: false },
  );
  const commandBus = app.get(CommandBus);
  const queryBus = app.get(QueryBus);
  return {
    contexts: [app, catalogRead],
    seed: new SeedCatalogHandler(new SeedSettings(sourceRoot), new AssetSeeder(commandBus, queryBus, references), new RecipeSeeder(commandBus, queryBus)),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function brandKitEntry(): Record<string, unknown> {
  return {
    assetId: BRAND_ASSET_ID,
    name: 'Coverage brand',
    summary: 'synthetic brand kit for the seed coverage',
    tags: ['coverage'],
    origin: 'studio',
    type: 'brand-kit',
    details: {
      colors: [{ name: 'ink', hex: '#112233' }],
      fonts: [],
      logoRefs: [],
      captionStyle: { fontFamily: 'Inter', fontSizePx: 32, color: '#ffffff', background: null, maxLines: 2 },
      safeZones: [],
      tagHints: [],
      toneOfVoice: '',
      motionStyle: '',
    },
  };
}

function manifest(): Record<string, unknown> {
  return {
    format: 'studio-catalog-seed',
    version: 1,
    owner: 'owner',
    recipesFolder: RECIPES_FOLDER,
    promptsFolder: PROMPTS_FOLDER,
    entries: [brandKitEntry()],
  };
}

interface SyntheticRootOptions {
  prompt: 'none' | 'valid' | 'missing-text';
  recipe: boolean;
}

/** A synthetic seed source root inside the temp home: the manifest, then the optional folders. */
async function writeSyntheticRoot(root: string, options: SyntheticRootOptions): Promise<void> {
  await writeJson(join(root, SEED_MANIFEST_RELATIVE_PATH), manifest());
  if (options.prompt !== 'none') {
    await writeJson(join(root, PROMPTS_FOLDER, PROMPT_FILE), {
      assetId: PROMPT_ASSET_ID,
      name: 'Coverage writer',
      textFile: 'coverage-writer.md',
      variables: [],
    });
    if (options.prompt === 'valid') await writeFile(join(root, PROMPTS_FOLDER, 'coverage-writer.md'), '# Coverage writer\n\nWrite a short tour.\n', 'utf8');
  }
  if (options.recipe) {
    const base = fixtures.recipe();
    // The binding leaves out contentHash: the recipe seeder pins it from the seeded prompt version.
    await writeJson(join(root, RECIPES_FOLDER, RECIPE_FILE), {
      recipeId: 'coverage-seed-recipe',
      definition: { ...base.definition, bindings: [{ slot: 'prompt:writer', ref: `${PROMPT_ASSET_ID}@1` }] },
    });
  }
}

function outcomesOf(report: SeedReport): [string, string, string][] {
  return report.entries.map((entry) => [entry.entryId, entry.target, entry.outcome]);
}

/** The version an entry points at; null for a failed entry. */
function pinOf(entry: SeedEntryResult): { ref: string; contentHash: string } | null {
  return entry.outcome === 'failed' ? null : { ref: entry.ref, contentHash: entry.contentHash };
}

describe('seed (ticket 07)', () => {
  let home: CoverageHome;
  let root: string;
  let seedUnderTest: SeedUnderTest;

  beforeEach(async () => {
    home = await createCoverageHome({ prefix: 'core-seed', start: new Date('2026-11-21T10:00:00.000Z') });
    root = join(home.root, 'seed-root');
    seedUnderTest = await seedOf(home, root);
  });

  afterEach(async () => {
    for (const context of seedUnderTest.contexts) await context.close();
    await home.close();
  });

  describe('idempotent seed on a synthetic root', () => {
    it('reports every entry created on the first run and unchanged on the second', async () => {
      await writeSyntheticRoot(root, { prompt: 'valid', recipe: true });

      const first = await seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root }));
      const second = await seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root }));

      assert.deepEqual(first.counts, { created: 3, unchanged: 0, failed: 0 });
      assert.deepEqual(outcomesOf(first), [
        [BRAND_ASSET_ID, 'asset', 'created'],
        [PROMPT_FILE, 'asset', 'created'],
        [RECIPE_FILE, 'recipe', 'created'],
      ]);
      assert.deepEqual(second.counts, { created: 0, unchanged: 3, failed: 0 });
      assert.deepEqual(second.entries.map(pinOf), first.entries.map(pinOf));
      assert.deepEqual(first.optionalFolders, { recipes: 'loaded', prompts: 'loaded' });
    });

    it('pins a recipe binding written without a hash to the seeded prompt version', async () => {
      await writeSyntheticRoot(root, { prompt: 'valid', recipe: true });

      const report = await seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root }));
      const prompt = report.entries.find((entry) => entry.entryId === PROMPT_FILE);
      const recipe = report.entries.find((entry) => entry.entryId === RECIPE_FILE);
      assert.ok(prompt?.outcome === 'created' && recipe?.outcome === 'created');
      const recipeRepository = new RecipeVersionRepository(home.prisma);
      const stored = await new GetRecipeVersionHandler(recipeRepository).execute(new GetRecipeVersionQuery(recipe.ref));

      assert.deepEqual(stored.recipe.bindings, [{ slot: 'prompt:writer', ref: `${PROMPT_ASSET_ID}@1`, contentHash: prompt.contentHash }]);
    });

    it('loads nothing from optional folders that are absent', async () => {
      await writeSyntheticRoot(root, { prompt: 'none', recipe: false });

      const report = await seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root }));

      assert.deepEqual(report.optionalFolders, { recipes: 'absent', prompts: 'absent' });
      assert.deepEqual(report.counts, { created: 1, unchanged: 0, failed: 0 });
    });

    it('reports a failing entry as failed and still seeds the others', async () => {
      await writeSyntheticRoot(root, { prompt: 'missing-text', recipe: false });

      const report = await seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root }));

      assert.deepEqual(outcomesOf(report), [
        [BRAND_ASSET_ID, 'asset', 'created'],
        [PROMPT_FILE, 'asset', 'failed'],
      ]);
      assert.deepEqual(report.counts, { created: 1, unchanged: 0, failed: 1 });
    });
  });

  describe('typed errors', () => {
    it('refuses a relative source root before reading any file', async () => {
      await assert.rejects(seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: 'seed-root' })), (error: unknown) => {
        assert.ok(error instanceof SeedSourceRootInvalidError);
        assert.equal(error.reason, 'not-absolute');
        return true;
      });
    });

    it('refuses a source root with a trailing slash', async () => {
      await assert.rejects(seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: `${root}/` })), (error: unknown) => {
        assert.ok(error instanceof SeedSourceRootInvalidError);
        assert.equal(error.reason, 'not-normalized');
        return true;
      });
    });

    it('answers SeedSourceMissingError when the root holds no manifest', async () => {
      await mkdir(root, { recursive: true });

      await assert.rejects(seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root })), SeedSourceMissingError);
    });

    it('refuses a manifest that breaks the seed schema', async () => {
      await writeJson(join(root, SEED_MANIFEST_RELATIVE_PATH), { ...manifest(), format: 'coverage-not-a-seed' });

      await assert.rejects(seedUnderTest.seed.execute(new SeedCatalogCommand({ sourceRoot: root })), SeedManifestInvalidError);
    });
  });
});
