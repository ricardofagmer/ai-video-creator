import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetRefSchema, Sha256Schema } from '@studio/shared/catalog';
import { RecipeSchema, type Recipe } from '@studio/shared/recipes';
import { GetAssetVersionQuery, MAX_PAGE_LIMIT } from '../catalog';
import {
  CreateRecipeCommand,
  ListRecipeVersionsQuery,
  SaveRecipeVersionCommand,
  hashRecipeDefinition,
  type RecipeDraftInput,
  type RecipeVersionView,
} from '../recipes';
import { SeedEntryInvalidError, SeedHistoryTooLongError } from './seed.errors';
import { type SeedRecipeFile } from './seed-manifest.schema';
import { type SeedEntryResult } from './seed-report';

/** At 100 versions per page, 2000 versions; a seeded recipe never comes close. */
const MAX_HISTORY_PAGES = 20;

/** A binding as a recipe author writes it in a seed file: `contentHash` may be left out. */
const SeedBindingSchema = z.object({ ref: AssetRefSchema, contentHash: Sha256Schema.optional() }).passthrough();
const SeedBindingsSchema = z.array(SeedBindingSchema).max(64);

const SYSTEM_FIELDS = ['id', 'version', 'status', 'createdAt', 'updatedAt'] as const;

/** C2 system fields, set here only so the draft can be validated whole before any write. */
function validationShell(recipeId: string): Pick<Recipe, 'id' | 'version' | 'status' | 'createdAt' | 'updatedAt'> {
  const now = new Date().toISOString();
  return { id: recipeId, version: 1, status: 'draft', createdAt: now, updatedAt: now };
}

/** Field by field, so a C2 field added later fails to compile here instead of being dropped. */
function toDraftInput(recipe: Recipe): RecipeDraftInput {
  return {
    name: recipe.name,
    description: recipe.description,
    owner: recipe.owner,
    provenance: recipe.provenance,
    notes: recipe.notes,
    graph: recipe.graph,
    bindings: recipe.bindings,
    format: recipe.format,
    gates: recipe.gates,
    inputs: recipe.inputs,
    checks: recipe.checks,
    limits: recipe.limits,
    rubric: recipe.rubric,
    checklist: recipe.checklist,
    allowedKinds: recipe.allowedKinds,
  };
}

/**
 * Loads one `seeds/recipes/*.recipe.json` idempotently through the recipes module's commands.
 * Bindings without a `contentHash` are pinned to the catalog version they name, so the seeded
 * assets come first. A saved version whose hash equals this definition's hash (computed at that
 * version's number, because the hash covers `version`; status and timestamps never enter it)
 * makes the entry `unchanged`.
 */
@Injectable()
export class RecipeSeeder {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async apply(entryId: string, file: SeedRecipeFile): Promise<SeedEntryResult> {
    const supplied = SYSTEM_FIELDS.filter((field) => Object.hasOwn(file.definition, field));
    if (supplied.length > 0) {
      throw new SeedEntryInvalidError(entryId, supplied.map((field) => ({ path: `definition.${field}`, message: 'set by the studio; omit it' })));
    }
    const definition = await this.pinBindings(entryId, file.definition);
    const parsed = RecipeSchema.safeParse({ ...definition, ...validationShell(file.recipeId) });
    if (!parsed.success) {
      throw new SeedEntryInvalidError(
        entryId,
        parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      );
    }
    const draft = parsed.data;
    const history = await this.historyOf(entryId, file.recipeId);

    if (history.length === 0) {
      const created = await this.commandBus.execute(new CreateRecipeCommand({ recipeId: file.recipeId, definition: toDraftInput(draft) }));
      return { outcome: 'created', entryId, target: 'recipe', ref: created.ref, contentHash: created.contentHash };
    }

    const sameDefinition = (view: RecipeVersionView): boolean =>
      hashRecipeDefinition({ ...draft, version: view.recipe.version }).contentHash === view.contentHash;
    const match = history.find((view) => view.recipe.status === 'active' && sameDefinition(view)) ?? history.find(sameDefinition);
    if (match !== undefined) return { outcome: 'unchanged', entryId, target: 'recipe', ref: match.ref, contentHash: match.contentHash };

    const saved = await this.commandBus.execute(new SaveRecipeVersionCommand({ recipeId: file.recipeId, definition: toDraftInput(draft) }));
    return { outcome: 'created', entryId, target: 'recipe', ref: saved.ref, contentHash: saved.contentHash };
  }

  private async pinBindings(entryId: string, definition: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (definition['bindings'] === undefined) return definition;
    const bindings = SeedBindingsSchema.safeParse(definition['bindings']);
    if (!bindings.success) {
      throw new SeedEntryInvalidError(entryId, [{ path: 'definition.bindings', message: 'each binding needs a ref (assetId@version)' }]);
    }
    const pinned: Record<string, unknown>[] = [];
    for (const binding of bindings.data) {
      if (binding.contentHash !== undefined) {
        pinned.push(binding);
        continue;
      }
      const version = await this.queryBus.execute(new GetAssetVersionQuery(binding.ref));
      pinned.push({ ...binding, contentHash: version.contentHash });
    }
    return { ...definition, bindings: pinned };
  }

  /** Every saved version of the recipe, oldest first; empty when the recipe does not exist yet. */
  private async historyOf(entryId: string, recipeId: string): Promise<RecipeVersionView[]> {
    const views: RecipeVersionView[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
      const result = await this.queryBus.execute(new ListRecipeVersionsQuery({ recipeId, limit: MAX_PAGE_LIMIT, cursor }));
      views.push(...result.items);
      if (result.nextCursor === null) return views;
      cursor = result.nextCursor;
    }
    throw new SeedHistoryTooLongError(entryId);
  }
}
