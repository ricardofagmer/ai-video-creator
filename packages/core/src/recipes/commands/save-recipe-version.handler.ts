import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { RecipeBindingVerifier } from '../recipe-binding.verifier';
import { hashRecipeDefinition } from '../recipe-definition';
import { buildDraftRecipe, parseRecipeId } from '../recipe-version.factory';
import { toCreateData, toRecipeVersionView, type RecipeVersionView } from '../recipe-version.mapper';
import { RecipeVersionRepository, isUniqueConstraintError } from '../recipe-version.repository';
import { RecipeNotFoundError, RecipeVersionConflictError } from '../recipes.errors';
import { SaveRecipeVersionCommand } from './save-recipe-version.command';

@CommandHandler(SaveRecipeVersionCommand)
export class SaveRecipeVersionHandler implements ICommandHandler<SaveRecipeVersionCommand, RecipeVersionView> {
  private readonly logger = new Logger(SaveRecipeVersionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: RecipeVersionRepository,
    private readonly bindings: RecipeBindingVerifier,
  ) {}

  async execute(command: SaveRecipeVersionCommand): Promise<RecipeVersionView> {
    const recipeId = parseRecipeId(command.input.recipeId);
    if (!(await this.versions.recipeExists(recipeId))) throw new RecipeNotFoundError(recipeId);

    // The version number is part of the hashed definition, so the draft is built for the planned
    // N+1 and the transaction refuses it if another writer took that number meanwhile.
    const planned = (await this.versions.findLatestVersionNumber(recipeId)) + 1;
    const draft = buildDraftRecipe({ recipeId, version: planned, definition: command.input.definition, now: new Date() });
    await this.bindings.verify(draft);
    const hashed = hashRecipeDefinition(draft);

    const saved = await this.prisma
      .$transaction(async (transaction) => {
        const next = (await this.versions.findLatestVersionNumber(recipeId, transaction)) + 1;
        if (next !== planned) throw new RecipeVersionConflictError(recipeId);
        return this.versions.insertVersion(toCreateData(draft, hashed), transaction);
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) throw new RecipeVersionConflictError(recipeId);
        throw error;
      });

    const view = toRecipeVersionView(saved);
    this.logger.log({ event: 'recipes.version-saved', ref: view.ref, contentHash: view.contentHash, bindings: view.recipe.bindings.length });
    return view;
  }
}
