import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AssetStatusSchema } from '@studio/shared/catalog';
import { RecipeRefSchema } from '@studio/shared/recipes';
import { PrismaService } from '../../prisma/prisma.service';
import { assertRecipeStatusTransition } from '../recipe-policy';
import { parseRecipeInput } from '../recipe-version.factory';
import { toRecipeVersionView } from '../recipe-version.mapper';
import { RecipeVersionRepository } from '../recipe-version.repository';
import { RecipeVersionNotFoundError } from '../recipes.errors';
import { parseRecipeRef } from '../recipe-ref';
import { SetRecipeStatusCommand, type SetRecipeStatusResult } from './set-recipe-status.command';
import { PromotionApprovalRequiredError } from './set-recipe-status.errors';

@CommandHandler(SetRecipeStatusCommand)
export class SetRecipeStatusHandler implements ICommandHandler<SetRecipeStatusCommand, SetRecipeStatusResult> {
  private readonly logger = new Logger(SetRecipeStatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: RecipeVersionRepository,
  ) {}

  async execute(command: SetRecipeStatusCommand): Promise<SetRecipeStatusResult> {
    const ref = parseRecipeInput(RecipeRefSchema, command.input.ref, 'ref');
    const status = parseRecipeInput(AssetStatusSchema, command.input.status, 'status');
    // Criterion 35 (R2-AC-18, B15): refused before any read, so nothing is written and the row keeps
    // its status. Activation is the promotion module's alone; the database trigger refuses it as well.
    if (status === 'active') {
      this.logger.warn({ event: 'promotion.refused', ref, reason: 'promotion-approval-required' });
      throw new PromotionApprovalRequiredError(ref);
    }
    const { recipeId, version } = parseRecipeRef(ref);

    const result = await this.prisma.$transaction(async (transaction): Promise<SetRecipeStatusResult> => {
      const row = await this.versions.findVersion(recipeId, version, transaction);
      if (row === null) throw new RecipeVersionNotFoundError(ref);
      const current = toRecipeVersionView(row);
      if (current.recipe.status === status) return { version: current };
      assertRecipeStatusTransition(ref, current.recipe.status, status);
      const updated = await this.versions.updateStatus(row.id, status, transaction);
      return { version: toRecipeVersionView(updated) };
    });

    this.logger.log({ event: 'recipes.status-changed', ref, status: result.version.recipe.status });
    return result;
  }
}
