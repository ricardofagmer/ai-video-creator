import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type ComparisonEstimate } from '@studio/shared/api';
import { MarkRunPendingCommand, type ComparisonStartConsent } from '../../runs';
import { StartComparisonInputSchema, parseComparisonInput, type StartComparisonFields } from '../comparison.input';
import { ComparisonEstimateService } from '../comparison-estimate.service';
import { decideComparisonStart, type StartRefusal } from '../comparison-gate';
import { ComparisonLocks } from '../comparison-locks';
import { type ComparisonRecord } from '../comparison-record.mapper';
import { ComparisonRepository } from '../comparison.repository';
import { ComparisonRunsReader, type LoadedPair } from '../comparison-runs.reader';
import { ComparisonViewAssembler } from '../comparison-view.assembler';
import { type ComparisonDetail } from '../comparison-view.mapper';
import {
  ComparisonEstimateChangedError,
  ComparisonNotFoundError,
  ComparisonNotStartableError,
  ComparisonOverMonthCeilingError,
  MonthSpendUnavailableError,
  type ComparisonsError,
} from '../comparisons.errors';
import { StartComparisonCommand } from './start-comparison.command';

interface RefusalContext {
  pair: LoadedPair;
  estimate: ComparisonEstimate;
}

function refusalError(refusal: StartRefusal, fields: StartComparisonFields, context: RefusalContext): ComparisonsError {
  switch (refusal.reason) {
    case 'comparison-not-startable':
      return new ComparisonNotStartableError(fields.comparisonId, {
        a: context.pair.a.run.state.status,
        b: context.pair.b.run.state.status,
      });
    case 'month-spend-unavailable':
      return new MonthSpendUnavailableError(fields.comparisonId);
    case 'comparison-estimate-changed':
      return new ComparisonEstimateChangedError(fields.comparisonId, fields.acceptedWorstCaseUsd, context.estimate.pairWorstCaseUsd);
    case 'comparison-over-month-ceiling':
      return new ComparisonOverMonthCeilingError(fields.comparisonId, {
        monthToDateUsd: refusal.monthToDateUsd,
        pairWorstCaseUsd: context.estimate.pairWorstCaseUsd,
        costPerMonthUsd: context.estimate.costPerMonthUsd,
      });
  }
}

/**
 * The comparison cost gate (SPEC 0003 section 5.3, D11, R2-AC-13, R2-AC-14). The estimate is
 * recomputed here; on any refusal nothing is written, so both runs stay `draft` with no consent.
 * On success each arm gets the consent and `pending` in one run.json write, arm A first. The
 * engine's own per-run and month checks still run at each arm's `preflight` (R1, unchanged).
 */
@CommandHandler(StartComparisonCommand)
export class StartComparisonHandler implements ICommandHandler<StartComparisonCommand, ComparisonDetail> {
  private readonly logger = new Logger(StartComparisonHandler.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly comparisons: ComparisonRepository,
    private readonly reader: ComparisonRunsReader,
    private readonly estimates: ComparisonEstimateService,
    private readonly assembler: ComparisonViewAssembler,
    private readonly locks: ComparisonLocks,
  ) {}

  async execute(command: StartComparisonCommand): Promise<ComparisonDetail> {
    const fields = parseComparisonInput(StartComparisonInputSchema, command.input, '');
    return this.locks.withComparison(fields.comparisonId, () => this.start(fields));
  }

  private async start(fields: StartComparisonFields): Promise<ComparisonDetail> {
    // Object-level check (section 6): the comparison is found by its own id and its two run.json
    // files must link back to it, so an arm of another comparison is never started here.
    const record = await this.comparisons.findRecord(fields.comparisonId);
    if (record === null) throw new ComparisonNotFoundError(fields.comparisonId);
    const pair = await this.reader.loadPair(record);
    const now = new Date();
    const monthToDateUsd = await this.estimates.monthToDateUsd(now);
    const estimate = await this.estimates.estimate({ a: pair.a.run, b: pair.b.run }, monthToDateUsd);
    const decision = decideComparisonStart({
      arms: {
        a: { status: pair.a.run.state.status, watcherAlive: pair.a.watcherAlive },
        b: { status: pair.b.run.state.status, watcherAlive: pair.b.watcherAlive },
      },
      estimate,
      acceptedWorstCaseUsd: fields.acceptedWorstCaseUsd,
    });
    if (decision.decision === 'refuse') {
      this.logger.warn({
        event: 'comparisons.start-refused',
        comparisonId: record.comparisonId,
        reason: decision.reason,
        ...this.amounts(estimate),
        correlationId: fields.correlationId,
      });
      throw refusalError(decision, fields, { pair, estimate });
    }

    const consent: ComparisonStartConsent = {
      comparisonId: record.comparisonId,
      costConsent: { worstCaseUsd: decision.pairWorstCaseUsd, acceptedBy: fields.acceptedBy, acceptedAt: now.toISOString() },
    };
    await this.commandBus.execute(new MarkRunPendingCommand(record.runAId, consent));
    await this.startArmB(record, consent, fields.correlationId);
    await this.recordStarted(record, now, fields.correlationId);
    this.logger.log({
      event: 'comparisons.started',
      comparisonId: record.comparisonId,
      ...this.amounts(estimate),
      correlationId: fields.correlationId,
    });
    return this.assembler.detailOf(record, monthToDateUsd);
  }

  /** Arm A is already `pending`; a failure here is reported loudly so the owner can act on arm B. */
  private async startArmB(record: ComparisonRecord, consent: ComparisonStartConsent, correlationId: string | null): Promise<void> {
    try {
      await this.commandBus.execute(new MarkRunPendingCommand(record.runBId, consent));
    } catch (error) {
      this.logger.error({
        event: 'comparisons.start-partial',
        comparisonId: record.comparisonId,
        pendingRunId: record.runAId,
        failedRunId: record.runBId,
        errorName: error instanceof Error ? error.name : 'unknown',
        correlationId,
      });
      throw error;
    }
  }

  /** `started_at` is index data; the consent in both run.json files is the record (files win). */
  private async recordStarted(record: ComparisonRecord, startedAt: Date, correlationId: string | null): Promise<void> {
    try {
      await this.comparisons.markStarted(record.comparisonId, startedAt);
    } catch (error) {
      this.logger.warn({
        event: 'comparisons.index-start-failed',
        comparisonId: record.comparisonId,
        errorName: error instanceof Error ? error.name : 'unknown',
        correlationId,
      });
    }
  }

  private amounts(estimate: ComparisonEstimate): Record<string, number | null> {
    return {
      pairWorstCaseUsd: estimate.pairWorstCaseUsd,
      monthToDateUsd: estimate.monthToDateUsd,
      costPerRunUsd: estimate.costPerRunUsd,
      costPerMonthUsd: estimate.costPerMonthUsd,
    };
  }
}
