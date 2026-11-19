import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { RecipeBindingVerifier } from '../recipe-binding.verifier';
import { hashRecipeDefinition } from '../recipe-definition';
import { buildDraftRecipe, parseRecipeId } from '../recipe-version.factory';
import { toCreateData, toRecipeVersionView, type RecipeVersionView } from '../recipe-version.mapper';
import { RecipeVersionRepository, isUniqueConstraintError } from '../recipe-version.repository';
import { RecipeAlreadyExistsError } from '../recipes.errors';
import { CreateRecipeCommand } from './create-recipe.command';

@CommandHandler(CreateRecipeCommand)
export class CreateRecipeHandler implements ICommandHandler<CreateRecipeCommand, RecipeVersionView> {
  private readonly logger = new Logger(CreateRecipeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: RecipeVersionRepository,
    private readonly bindings: RecipeBindingVerifier,
  ) {}

  async execute(command: CreateRecipeCommand): Promise<RecipeVersionView> {
    const recipeId = parseRecipeId(command.input.recipeId);
    if (await this.versions.recipeExists(recipeId)) throw new RecipeAlreadyExistsError(recipeId);
    const draft = buildDraftRecipe({ recipeId, version: 1, definition: command.input.definition, now: new Date() });
    await this.bindings.verify(draft);
    const hashed = hashRecipeDefinition(draft);

    const saved = await this.prisma
      .$transaction(async (transaction) => {
        await this.versions.createRecipe(recipeId, transaction);
        return this.versions.insertVersion(toCreateData(draft, hashed), transaction);
      })
      .catch((error: unknown) => {
        // Another writer created the same recipe id between the check and the insert.
        if (isUniqueConstraintError(error)) throw new RecipeAlreadyExistsError(recipeId);
        throw error;
      });

    const view = toRecipeVersionView(saved);
    this.logger.log({ event: 'recipes.created', ref: view.ref, contentHash: view.contentHash, bindings: view.recipe.bindings.length });
    return view;
  }
}
