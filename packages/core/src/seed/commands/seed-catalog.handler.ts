import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AssetSeeder } from '../asset-seeder';
import { RecipeSeeder } from '../recipe-seeder';
import { type SeedAssetUnit } from '../seed-asset-plan';
import { seedAssetUnits } from '../seed-entry-plans';
import { toSeedFailure } from '../seed-failure.mapper';
import { listOptionalSeedFolder, readSeedJson } from '../seed-files';
import {
  PROMPT_FILE_SUFFIX,
  RECIPE_FILE_SUFFIX,
  SeedManifestSchema,
  SeedRecipeFileSchema,
  type SeedManifest,
} from '../seed-manifest.schema';
import { seedPromptUnits } from '../seed-prompt-plans';
import { countOutcomes, type SeedEntryResult, type SeedReport } from '../seed-report';
import { SEED_MANIFEST_RELATIVE_PATH, SeedSettings, assertSeedSourceRoot, resolveSeedPath } from '../seed-source';
import { SeedEntryInvalidError, SeedManifestInvalidError } from '../seed.errors';
import { SeedCatalogCommand } from './seed-catalog.command';

const MANIFEST_ENTRY_ID = 'catalog.seed.json';

/** State shared by every entry of one seed run. */
interface SeedRun {
  root: string;
  manifest: SeedManifest;
  signal: AbortSignal | undefined;
}

/**
 * Runs the seed in a fixed order, one entry at a time (SQLite has one writer; hashing stays
 * bounded): manifest assets, then prompts, then recipes, because recipe bindings pin the seeded
 * asset versions. Only an unreadable manifest or an abort stops the whole seed.
 */
@CommandHandler(SeedCatalogCommand)
export class SeedCatalogHandler implements ICommandHandler<SeedCatalogCommand, SeedReport> {
  private readonly logger = new Logger(SeedCatalogHandler.name);

  constructor(
    private readonly settings: SeedSettings,
    private readonly assets: AssetSeeder,
    private readonly recipes: RecipeSeeder,
  ) {}

  async execute(command: SeedCatalogCommand): Promise<SeedReport> {
    const { signal } = command.input;
    const root = command.input.sourceRoot === undefined ? this.settings.sourceRoot : assertSeedSourceRoot(command.input.sourceRoot);
    const manifest = await this.loadManifest(root);
    const run: SeedRun = { root, manifest, signal };
    const entries: SeedEntryResult[] = [];

    for (const unit of seedAssetUnits(manifest, root)) entries.push(await this.runAsset(unit, run));

    const prompts = await listOptionalSeedFolder(resolveSeedPath(root, manifest.promptsFolder), PROMPT_FILE_SUFFIX);
    for (const unit of seedPromptUnits(manifest, root, prompts.fileNames)) entries.push(await this.runAsset(unit, run));

    const recipes = await listOptionalSeedFolder(resolveSeedPath(root, manifest.recipesFolder), RECIPE_FILE_SUFFIX);
    for (const fileName of recipes.fileNames) entries.push(await this.runRecipe(fileName, run));

    const report: SeedReport = {
      entries,
      optionalFolders: { recipes: recipes.state, prompts: prompts.state },
      counts: countOutcomes(entries),
    };
    this.logger.log({ event: 'seed.completed', ...report.counts, recipesFolder: recipes.state, promptsFolder: prompts.state });
    return report;
  }

  private async loadManifest(root: string): Promise<SeedManifest> {
    const raw = await readSeedJson(resolveSeedPath(root, SEED_MANIFEST_RELATIVE_PATH), MANIFEST_ENTRY_ID);
    const parsed = SeedManifestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SeedManifestInvalidError(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    }
    return parsed.data;
  }

  private async runAsset(unit: SeedAssetUnit, run: SeedRun): Promise<SeedEntryResult> {
    const { signal } = run;
    signal?.throwIfAborted();
    try {
      const plan = await unit.plan();
      return this.logged(await this.assets.apply(unit.entryId, plan, signal));
    } catch (error) {
      if (signal?.aborted === true) throw error;
      return this.logged({ outcome: 'failed', entryId: unit.entryId, target: 'asset', failure: toSeedFailure(unit.entryId, error) });
    }
  }

  private async runRecipe(fileName: string, run: SeedRun): Promise<SeedEntryResult> {
    const { signal } = run;
    signal?.throwIfAborted();
    try {
      const raw = await readSeedJson(resolveSeedPath(run.root, `${run.manifest.recipesFolder}/${fileName}`), fileName);
      const parsed = SeedRecipeFileSchema.safeParse(raw);
      if (!parsed.success) {
        throw new SeedEntryInvalidError(fileName, parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
      }
      return this.logged(await this.recipes.apply(fileName, parsed.data));
    } catch (error) {
      if (signal?.aborted === true) throw error;
      return this.logged({ outcome: 'failed', entryId: fileName, target: 'recipe', failure: toSeedFailure(fileName, error) });
    }
  }

  /** Ids, refs and error codes only: no path, no content (an entry may be biometric). */
  private logged(result: SeedEntryResult): SeedEntryResult {
    if (result.outcome === 'failed') {
      this.logger.warn({ event: 'seed.entry', entryId: result.entryId, target: result.target, outcome: result.outcome, code: result.failure.code });
    } else {
      this.logger.log({ event: 'seed.entry', entryId: result.entryId, target: result.target, outcome: result.outcome, ref: result.ref });
    }
    return result;
  }
}
