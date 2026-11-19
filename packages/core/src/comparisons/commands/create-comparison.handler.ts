import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { newRunId, newUlid } from '@studio/shared/run-files';
import { type AssetRef } from '@studio/shared/catalog';
import { canonicalJson, type Brief, type RecipeRef } from '@studio/shared/recipes';
import { type ComparisonId, type CorrelationId, type RunComparisonLink, type RunId } from '@studio/shared/run-format';
import { CreateRunDraftCommand, DetachRunComparisonCommand } from '../../runs';
import { COMPARISON_TITLE_MAX_CHARS, CreateComparisonInputSchema, parseComparisonInput } from '../comparison.input';
import { ComparisonEstimateService } from '../comparison-estimate.service';
import { type ComparisonRecord } from '../comparison-record.mapper';
import { ComparisonRepository } from '../comparison.repository';
import { ComparisonSubjectResolver, type ResolvedComparison } from '../comparison-subject.resolver';
import { briefHashOf } from '../comparison-verification';
import { ComparisonViewAssembler } from '../comparison-view.assembler';
import { type ComparisonDetail } from '../comparison-view.mapper';
import { VariantRecipeService } from '../variant-recipe.service';
import { CreateComparisonCommand } from './create-comparison.command';

type Arm = 'a' | 'b';

interface ArmRecipes {
  a: RecipeRef;
  b: RecipeRef;
  /** Arm B's variant (asset-binding only) and whether an existing one was reused (B12). */
  variant: { ref: RecipeRef; reused: boolean } | null;
}

/** What both arms share; built once so the two drafts cannot drift apart (R2-AC-12). */
interface SharedDraft {
  comparisonId: ComparisonId;
  runIds: Readonly<Record<Arm, RunId>>;
  link: Omit<RunComparisonLink, 'arm' | 'peerRunId'>;
  brief: Brief;
  references: readonly AssetRef[];
  title: string;
  correlationId: CorrelationId | null;
}

function otherArm(arm: Arm): Arm {
  return arm === 'a' ? 'b' : 'a';
}

@CommandHandler(CreateComparisonCommand)
export class CreateComparisonHandler implements ICommandHandler<CreateComparisonCommand, ComparisonDetail> {
  private readonly logger = new Logger(CreateComparisonHandler.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly resolver: ComparisonSubjectResolver,
    private readonly variants: VariantRecipeService,
    private readonly comparisons: ComparisonRepository,
    private readonly estimates: ComparisonEstimateService,
    private readonly assembler: ComparisonViewAssembler,
  ) {}

  async execute(command: CreateComparisonCommand): Promise<ComparisonDetail> {
    const fields = parseComparisonInput(CreateComparisonInputSchema, command.input, '');
    const { request } = fields;
    // Every refusal (subject, biometric, run-draft checks) happens here, before any write.
    const resolved = await this.resolver.resolve(request);

    const now = new Date();
    const comparisonId = newUlid(now.getTime());
    const recipes = await this.armRecipes(resolved, { comparisonId, author: fields.createdBy, now });
    // One parsed `Brief` value feeds both arms; its hash is the link's `briefHash`.
    const brief = request.brief;
    const shared: SharedDraft = {
      comparisonId,
      runIds: { a: newRunId(), b: newRunId() },
      link: { comparisonId, subject: resolved.subject, briefHash: briefHashOf(brief), learningsCutoff: now.toISOString(), costConsent: null },
      brief,
      references: request.references ?? [],
      title: (request.title ?? brief.topic).slice(0, COMPARISON_TITLE_MAX_CHARS),
      correlationId: fields.correlationId,
    };

    await this.createArm(shared, 'a', recipes.a);
    try {
      await this.createArm(shared, 'b', recipes.b);
    } catch (error) {
      await this.leaveOrdinaryDraft(shared);
      throw error;
    }

    const record: ComparisonRecord = {
      comparisonId,
      title: shared.title,
      createdBy: fields.createdBy,
      createdAt: shared.link.learningsCutoff,
      runAId: shared.runIds.a,
      runBId: shared.runIds.b,
    };
    await this.indexComparison(record, shared, now);
    this.logger.log({
      event: 'comparisons.created',
      comparisonId,
      runAId: record.runAId,
      runBId: record.runBId,
      subjectKind: resolved.subject.kind,
      a: resolved.subject.a,
      b: resolved.subject.b,
      variantRecipeRef: recipes.variant?.ref ?? null,
      variantReused: recipes.variant?.reused ?? null,
      correlationId: shared.correlationId,
    });
    return this.assembler.detailOf(record, await this.estimates.monthToDateUsd(now));
  }

  private async armRecipes(resolved: ResolvedComparison, facts: { comparisonId: ComparisonId; author: string; now: Date }): Promise<ArmRecipes> {
    if (resolved.kind === 'recipe-version') return { a: resolved.armA.ref, b: resolved.armB.ref, variant: null };
    const variant = await this.variants.variantFor({
      base: resolved.base.recipe,
      slot: resolved.subject.slot,
      compared: { ref: resolved.subject.b, contentHash: resolved.comparedVersion.contentHash },
      comparisonId: facts.comparisonId,
      author: facts.author,
      now: facts.now,
    });
    return { a: resolved.base.ref, b: variant.view.ref, variant: { ref: variant.view.ref, reused: variant.reused } };
  }

  private async createArm(shared: SharedDraft, arm: Arm, recipeRef: RecipeRef): Promise<void> {
    await this.commandBus.execute(
      new CreateRunDraftCommand(
        {
          recipeRef,
          brief: shared.brief,
          references: [...shared.references],
          title: `${shared.title} (${arm.toUpperCase()})`,
          // B19: comparisons are created from the web only, through the api.
          createdBy: 'api',
          correlationId: shared.correlationId,
        },
        { runId: shared.runIds[arm], comparison: { ...shared.link, arm, peerRunId: shared.runIds[otherArm(arm)] } },
      ),
    );
  }

  /**
   * Section 5.3: when arm B cannot be created, arm A is left as an ordinary draft and the caller
   * gets arm B's error; nothing has been spent. A failed detach is logged, never swallowed into a
   * success: the original error still propagates.
   */
  private async leaveOrdinaryDraft(shared: SharedDraft): Promise<void> {
    try {
      await this.commandBus.execute(new DetachRunComparisonCommand(shared.runIds.a, shared.comparisonId));
    } catch (error) {
      this.logger.error({
        event: 'comparisons.detach-failed',
        comparisonId: shared.comparisonId,
        runId: shared.runIds.a,
        errorName: error instanceof Error ? error.name : 'unknown',
        correlationId: shared.correlationId,
      });
    }
  }

  /**
   * Both run.json files are written and are the source of truth, so a failed index insert must
   * not read as a failed creation (a retry would create a second pair). The run index rebuild
   * restores the row from the two links.
   */
  private async indexComparison(record: ComparisonRecord, shared: SharedDraft, now: Date): Promise<void> {
    try {
      await this.comparisons.insert({
        id: record.comparisonId,
        title: record.title,
        createdBy: record.createdBy,
        createdAt: now,
        // Canonical, as the run index rebuild writes it, so a restored row compares equal.
        subjectJson: canonicalJson(shared.link.subject),
        briefHash: shared.link.briefHash,
        runAId: record.runAId,
        runBId: record.runBId,
      });
    } catch (error) {
      this.logger.warn({
        event: 'comparisons.index-insert-failed',
        comparisonId: record.comparisonId,
        errorName: error instanceof Error ? error.name : 'unknown',
        correlationId: shared.correlationId,
      });
    }
  }
}
