import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type AssetRef } from '@studio/shared/catalog';
import { missingBriefInputs } from '@studio/shared/recipes';
import { RunFileError, RunFileNotFoundError, newRunId, readRunFile, readWatcherState, runDirectory, writeRunFile } from '@studio/shared/run-files';
import { ComparisonIdSchema, RunIdSchema, type RunFile, type RunId } from '@studio/shared/run-format';
import { AssetVersionNotFoundError, GetAssetVersionQuery } from '../catalog';
import { DataHome } from '../paths/data-home';
import { GetRecipeVersionQuery, RUNNABLE_RECIPE_STATUSES, RecipeBindingVerifier } from '../recipes';
import {
  ComparisonArmDraftSchema,
  ComparisonStartConsentSchema,
  type ComparisonArmDraft,
  type ComparisonStartConsent,
} from './run-comparison';
import { CreateRunDraftInputSchema, parseRunInput, type CreateRunDraftInput } from './run-draft.input';
import { buildDraftRun } from './run-draft.factory';
import { RunIndexService } from './run-index.service';
import {
  BriefInputsMissingError,
  RecipeNotRunnableError,
  RunAlreadyExistsError,
  RunComparisonMismatchError,
  RunComparisonStartRequiredError,
  RunFolderMismatchError,
  RunNotFoundError,
  RunOwnedByWatcherError,
  RunReferenceNotFoundError,
  RunStatusConflictError,
} from './runs.errors';

/** `stale`: run.json was written but its index row was not; the next index rebuild repairs it. */
export type RunIndexState = 'synced' | 'stale';

export interface RunDraftResult {
  run: RunFile;
  index: RunIndexState;
}

/**
 * The api/CLI side of a run before the watcher (ADR 0003 "Who writes what"): creates the `draft`
 * run.json and moves it to `pending`, always through C5, then mirrors it into the run index.
 * SPEC 0003 section 5.3: an A/B comparison arm is created with its `comparison` link and started
 * only with the pair's cost consent, which is written in the same run.json write as `pending`.
 */
@Injectable()
export class RunDraftService {
  private readonly logger = new Logger(RunDraftService.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly bindings: RecipeBindingVerifier,
    private readonly dataHome: DataHome,
    private readonly index: RunIndexService,
  ) {}

  /** Criterion 8: the run pins the recipe version and, through it, every bound `assetId@version` + hash. */
  async create(input: CreateRunDraftInput, armInput?: ComparisonArmDraft): Promise<RunDraftResult> {
    const fields = parseRunInput(CreateRunDraftInputSchema, input, '');
    const arm = armInput === undefined ? null : parseRunInput(ComparisonArmDraftSchema, armInput, 'comparison');
    const resolved = await this.queryBus.execute(new GetRecipeVersionQuery(fields.recipeRef));
    const recipe = resolved.recipe;
    if (!RUNNABLE_RECIPE_STATUSES.includes(recipe.status)) throw new RecipeNotRunnableError(resolved.ref, recipe.status);
    const missing = missingBriefInputs(fields.brief, recipe.inputs);
    if (missing.length > 0) throw new BriefInputsMissingError(resolved.ref, missing);
    await this.bindings.verify(recipe);
    await this.verifyReferences(fields.references);

    const runId = arm?.runId ?? newRunId();
    const runDir = runDirectory(this.dataHome.runs, runId);
    if (arm !== null) await this.assertNoRunFile(runDir, runId);
    const run = buildDraftRun({
      runId,
      title: fields.title ?? fields.brief.topic.slice(0, 200),
      createdBy: fields.createdBy,
      correlationId: fields.correlationId,
      recipe: { ref: resolved.ref, contentHash: resolved.contentHash, definition: recipe },
      brief: fields.brief,
      references: fields.references,
      comparison: arm?.comparison ?? null,
      now: new Date(),
    });
    await writeRunFile(runDir, run);
    const index = await this.refreshIndex(runDir, run.runId);
    this.logger.log({
      event: 'runs.draft-created',
      runId: run.runId,
      recipeRef: run.recipe.ref,
      recipeContentHash: run.recipe.contentHash,
      bindings: recipe.bindings.length,
      references: run.references.length,
      createdBy: run.createdBy,
      correlationId: run.correlationId,
      comparisonId: run.comparison?.comparisonId ?? null,
      comparisonArm: run.comparison?.arm ?? null,
      index,
    });
    return { run, index };
  }

  /**
   * `draft` -> `pending`, the only status change the api/CLI makes before a watcher runs.
   * Idempotent. A comparison arm needs `consent` naming its comparison; the consent is written in
   * the same run.json write as `pending`, so an arm never runs without it.
   */
  async markPending(runIdInput: string, consentInput?: ComparisonStartConsent): Promise<RunDraftResult> {
    const runId = parseRunInput(RunIdSchema, runIdInput, 'runId');
    const consent = consentInput === undefined ? null : parseRunInput(ComparisonStartConsentSchema, consentInput, 'consent');
    const runDir = runDirectory(this.dataHome.runs, runId);
    const run = await this.readRun(runDir, runId);
    if (run.state.status === 'pending') return { run, index: await this.refreshIndex(runDir, runId) };
    if (run.state.status !== 'draft') throw new RunStatusConflictError(runId, run.state.status, 'draft');
    if (run.comparison !== undefined && consent === null) throw new RunComparisonStartRequiredError(runId, run.comparison.comparisonId);
    if (consent !== null && run.comparison?.comparisonId !== consent.comparisonId) {
      throw new RunComparisonMismatchError(runId, consent.comparisonId);
    }
    if ((await readWatcherState(runDir)).status === 'alive') throw new RunOwnedByWatcherError(runId);

    const since = new Date().toISOString();
    const pending: RunFile = { ...run, updatedAt: since, state: { status: 'pending', since } };
    if (consent !== null && run.comparison !== undefined) pending.comparison = { ...run.comparison, costConsent: consent.costConsent };
    await writeRunFile(runDir, pending);
    const index = await this.refreshIndex(runDir, runId);
    this.logger.log({
      event: 'runs.marked-pending',
      runId,
      correlationId: run.correlationId,
      comparisonId: pending.comparison?.comparisonId ?? null,
      index,
    });
    return { run: pending, index };
  }

  /**
   * SPEC 0003 section 5.3: when the second arm of a comparison cannot be created, the first is left
   * as an ordinary draft. Removes the link from a `draft` run; a run without a link is unchanged.
   */
  async detachComparison(runIdInput: string, comparisonIdInput: string): Promise<RunDraftResult> {
    const runId = parseRunInput(RunIdSchema, runIdInput, 'runId');
    const comparisonId = parseRunInput(ComparisonIdSchema, comparisonIdInput, 'comparisonId');
    const runDir = runDirectory(this.dataHome.runs, runId);
    const run = await this.readRun(runDir, runId);
    if (run.comparison === undefined) return { run, index: await this.refreshIndex(runDir, runId) };
    if (run.comparison.comparisonId !== comparisonId) throw new RunComparisonMismatchError(runId, comparisonId);
    if (run.state.status !== 'draft') throw new RunStatusConflictError(runId, run.state.status, 'draft');
    if ((await readWatcherState(runDir)).status === 'alive') throw new RunOwnedByWatcherError(runId);

    const ordinary: RunFile = { ...run, updatedAt: new Date().toISOString() };
    delete ordinary.comparison;
    await writeRunFile(runDir, ordinary);
    const index = await this.refreshIndex(runDir, runId);
    this.logger.log({ event: 'runs.comparison-detached', runId, comparisonId, correlationId: run.correlationId, index });
    return { run: ordinary, index };
  }

  private async readRun(runDir: string, runId: RunId): Promise<RunFile> {
    let run: RunFile;
    try {
      run = await readRunFile(runDir);
    } catch (error) {
      if (error instanceof RunFileNotFoundError) throw new RunNotFoundError(runId);
      throw error;
    }
    if (run.runId !== runId) throw new RunFolderMismatchError(runId, run.runId);
    return run;
  }

  /** A caller-allocated run id must not overwrite a run folder, readable or not. */
  private async assertNoRunFile(runDir: string, runId: RunId): Promise<void> {
    try {
      await readRunFile(runDir);
    } catch (error) {
      if (error instanceof RunFileNotFoundError) return;
      if (error instanceof RunFileError) throw new RunAlreadyExistsError(runId);
      throw error;
    }
    throw new RunAlreadyExistsError(runId);
  }

  private async verifyReferences(refs: readonly AssetRef[]): Promise<void> {
    const missing: AssetRef[] = [];
    for (const ref of refs) {
      try {
        await this.queryBus.execute(new GetAssetVersionQuery(ref));
      } catch (error) {
        if (!(error instanceof AssetVersionNotFoundError)) throw error;
        missing.push(ref);
      }
    }
    if (missing.length > 0) throw new RunReferenceNotFoundError(missing);
  }

  /**
   * run.json is already written and is the source of truth, so a failed mirror must not read as a
   * failed creation (a retry would create a second run). The api resyncs the index on start.
   */
  private async refreshIndex(runDir: string, runId: RunId): Promise<RunIndexState> {
    try {
      await this.index.syncRun(runDir);
      return 'synced';
    } catch (error) {
      this.logger.warn({ event: 'runs.index-sync-failed', runId, errorName: error instanceof Error ? error.name : 'unknown' });
      return 'stale';
    }
  }
}
