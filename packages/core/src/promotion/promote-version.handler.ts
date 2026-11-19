import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { parseAssetRef } from '@studio/shared/catalog';
import { type InputIssue } from '../catalog';
import { toAssetVersion, versionReadProjection } from '../catalog/asset-version.mapper';
import { AssetVersionRepository, isUniqueConstraintError } from '../catalog/asset-version.repository';
import { assertActivatable, assertStatusTransition } from '../catalog/catalog-policy';
import { AssetVersionConflictError, AssetVersionNotFoundError } from '../catalog/catalog.errors';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { assertRecipeStatusTransition } from '../recipes/recipe-policy';
import { parseRecipeRef } from '../recipes/recipe-ref';
import { toRecipeVersionView } from '../recipes/recipe-version.mapper';
import { RecipeVersionRepository } from '../recipes/recipe-version.repository';
import { RecipeVersionConflictError, RecipeVersionNotFoundError } from '../recipes/recipes.errors';
import { RedactorService } from '../redaction/redactor.service';
import { PromoteVersionCommand, type PromoteVersionResult } from './promote-version.command';
import { toPromotionApprovalView } from './promotion-approval.mapper';
import { PromotionApprovalRepository } from './promotion-approval.repository';
import { parsePromotionInput, type ParsedPromotionInput } from './promotion-input';
import { InvalidPromotionInputError, PromotionRefMismatchError, PromotionSecretScanUnavailableError } from './promotion.errors';

/**
 * The only code that writes `status = 'active'` (criterion 35, R2-AC-21). The two activating
 * updates are written here on purpose, not in a shared repository, so a source search for writers
 * of `active` finds this file alone. Order inside one transaction (section 5.4): check, insert the
 * approval, deprecate the current active version, activate. The database triggers accept the
 * activation only with a new approval id that is the newest one recorded for that very row.
 */
@CommandHandler(PromoteVersionCommand)
export class PromoteVersionHandler implements ICommandHandler<PromoteVersionCommand, PromoteVersionResult> {
  private readonly logger = new Logger(PromoteVersionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetVersionRepository,
    private readonly recipes: RecipeVersionRepository,
    private readonly approvals: PromotionApprovalRepository,
    private readonly redactor: RedactorService,
  ) {}

  async execute(command: PromoteVersionCommand): Promise<PromoteVersionResult> {
    const input = parsePromotionInput(command.input);
    if (input.acknowledgeRef !== input.ref) {
      this.logRefused(input.ref, 'promotion-ref-mismatch');
      throw new PromotionRefMismatchError(input.ref);
    }
    await this.assertReasonClean(input);
    const decidedAt = new Date();
    const result = input.target === 'asset-version' ? await this.promoteAsset(input, decidedAt) : await this.promoteRecipe(input, decidedAt);

    // Ids and refs only: the reason and the approver's name are never logged (section 7).
    this.logger.log({
      event: 'catalog.promoted',
      target: result.target,
      ref: input.ref,
      approvalId: result.approval.approvalId,
      replacedRef: replacedRefOf(result),
      evidence: { comparisonId: input.evidence.comparisonId, runIds: input.evidence.runIds },
    });
    return result;
  }

  private async promoteAsset(input: ParsedPromotionInput, decidedAt: Date): Promise<PromoteVersionResult> {
    const { assetId, version } = parseAssetRef(input.ref);
    return this.prisma
      .$transaction(async (transaction): Promise<PromoteVersionResult> => {
        const row = await this.assets.findVersion(assetId, version, transaction);
        if (row === null) throw new AssetVersionNotFoundError(input.ref);
        const current = toAssetVersion(row);
        // `active` -> `active` is refused here: an approval always records a real transition.
        assertStatusTransition(input.ref, current.status, 'active');
        assertActivatable(input.ref, current);
        await this.assertEvidenceExists(input, transaction);

        const active = await this.assets.findActiveVersion(assetId, transaction);
        const approval = await this.approvals.insert(
          {
            target: 'asset-version',
            versionRowId: row.id,
            decidedBy: input.decidedBy,
            decidedAt,
            reason: input.reason,
            evidence: input.evidence,
            replacedVersion: active?.version ?? null,
            qualityScoreAtApproval: row.qualityScore,
            sampleSizeAtApproval: row.qualitySampleSize,
            correlationId: input.correlationId,
          },
          transaction,
        );
        const replaced = active === null ? null : toAssetVersion(await this.assets.updateStatus(active.id, 'deprecated', transaction));
        const activated = await transaction.assetVersion.update({
          where: { id: row.id },
          data: { status: 'active', activationApprovalId: approval.id },
          ...versionReadProjection,
        });
        return { target: 'asset-version', version: toAssetVersion(activated), replaced, approval: toPromotionApprovalView(approval) };
      })
      .catch((error: unknown) => {
        // The partial unique index "one active per asset" fired: another writer activated first.
        if (isUniqueConstraintError(error)) throw new AssetVersionConflictError(assetId);
        throw error;
      });
  }

  private async promoteRecipe(input: ParsedPromotionInput, decidedAt: Date): Promise<PromoteVersionResult> {
    const { recipeId, version } = parseRecipeRef(input.ref);
    return this.prisma
      .$transaction(async (transaction): Promise<PromoteVersionResult> => {
        const row = await this.recipes.findVersion(recipeId, version, transaction);
        if (row === null) throw new RecipeVersionNotFoundError(input.ref);
        const current = toRecipeVersionView(row);
        assertRecipeStatusTransition(input.ref, current.recipe.status, 'active');
        await this.assertEvidenceExists(input, transaction);

        const active = await this.recipes.findActiveVersion(recipeId, transaction);
        const approval = await this.approvals.insert(
          {
            target: 'recipe-version',
            versionRowId: row.id,
            decidedBy: input.decidedBy,
            decidedAt,
            reason: input.reason,
            evidence: input.evidence,
            replacedVersion: active?.version ?? null,
            // Recipes carry no quality score (section 5.1 scores asset versions only).
            qualityScoreAtApproval: null,
            sampleSizeAtApproval: 0,
            correlationId: input.correlationId,
          },
          transaction,
        );
        const replaced =
          active === null ? null : toRecipeVersionView(await this.recipes.updateStatus(active.id, 'deprecated', transaction));
        const activated = await transaction.recipeVersion.update({
          where: { id: row.id },
          data: { status: 'active', activationApprovalId: approval.id },
        });
        return { target: 'recipe-version', version: toRecipeVersionView(activated), replaced, approval: toPromotionApprovalView(approval) };
      })
      .catch((error: unknown) => {
        // The partial unique index "one active per recipe" fired: another writer activated first.
        if (isUniqueConstraintError(error)) throw new RecipeVersionConflictError(recipeId);
        throw error;
      });
  }

  /** Section 6: reasons are scanned by the R1 redactor before storage; a hit is refused, never stored redacted. */
  private async assertReasonClean(input: ParsedPromotionInput): Promise<void> {
    if (input.reason.length === 0) return;
    const scanned = await this.redactor.redactText(input.reason);
    if (scanned.status === 'failed') {
      this.logRefused(input.ref, 'promotion-secret-scan-unavailable');
      throw new PromotionSecretScanUnavailableError(input.ref);
    }
    if (scanned.value !== input.reason) {
      this.logRefused(input.ref, 'invalid-promotion-input');
      throw new InvalidPromotionInputError([{ path: 'reason', message: 'matches a secret pattern; nothing was recorded' }]);
    }
  }

  /** B16: evidence is optional and informational, but every id it names must exist. */
  private async assertEvidenceExists(input: ParsedPromotionInput, transaction: PrismaTransaction): Promise<void> {
    const missing = await this.approvals.findMissingEvidence(input.evidence, transaction);
    const issues: InputIssue[] = [];
    if (missing.comparisonId !== null) issues.push({ path: 'evidence.comparisonId', message: `no comparison ${missing.comparisonId}` });
    for (const runId of missing.runIds) issues.push({ path: 'evidence.runIds', message: `no run ${runId}` });
    if (issues.length > 0) {
      this.logRefused(input.ref, 'invalid-promotion-input');
      throw new InvalidPromotionInputError(issues);
    }
  }

  private logRefused(ref: string, reasonId: string): void {
    this.logger.warn({ event: 'promotion.refused', ref, reason: reasonId });
  }
}

function replacedRefOf(result: PromoteVersionResult): string | null {
  if (result.target === 'asset-version') {
    return result.replaced === null ? null : `${result.replaced.id}@${result.replaced.version}`;
  }
  return result.replaced === null ? null : result.replaced.ref;
}
