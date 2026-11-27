import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type CreateCurationRequest, type CurationView } from '@studio/shared/api';
import { CURATION_FORMAT_VERSION, CurationFileSchema, CurationIdSchema, curationBounds, type CurationFile } from '@studio/shared/curation';
import { newUlid } from '@studio/shared/run-files';
import { CostLedgerService } from '../../costs/cost-ledger.service';
import { queueOf, subjectKey } from '../curation-queue';
import { CURATION_MONTH_CEILING_USD, decideCurationSpend } from '../curation-spend';
import { CurationStore } from '../curation-store';
import { CurationSubjectSelector, subjectRefusalError } from '../curation-subject.selector';
import { CurationViewAssembler } from '../curation-view.assembler';
import {
  CurationAlreadyRequestedError,
  CurationError,
  CurationEstimateChangedError,
  CurationMonthSpendUnavailableError,
  CurationOverMonthCeilingError,
  CurationQueueFullError,
} from '../curation.errors';
import { RequestCurationInputSchema, parseCurationInput } from '../curation.input';
import { SerialMutex } from '../../runtime/keyed-mutex';
import { RequestCurationCommand } from './request-curation.command';

@CommandHandler(RequestCurationCommand)
export class RequestCurationHandler implements ICommandHandler<RequestCurationCommand, CurationView> {
  private readonly logger = new Logger(RequestCurationHandler.name);
  /** The queue count and the folder creation must not interleave within this api process. */
  private readonly requests = new SerialMutex();

  constructor(
    private readonly selector: CurationSubjectSelector,
    private readonly store: CurationStore,
    private readonly costs: CostLedgerService,
    private readonly assembler: CurationViewAssembler,
  ) {}

  async execute(command: RequestCurationCommand): Promise<CurationView> {
    const { request, correlationId } = parseCurationInput(RequestCurationInputSchema, command.input, '');
    try {
      // The mutex only orders the requests; each caller still receives its own result or error.
      return await this.requests.run(() => this.request(request, correlationId));
    } catch (error) {
      if (error instanceof CurationError) {
        this.logger.log({ event: 'curation.refused-request', correlationId, reason: error.reason });
      }
      throw error;
    }
  }

  private async request(request: CreateCurationRequest, correlationId: string): Promise<CurationView> {
    const { subject } = request;
    const selection = await this.selector.select(subject);
    if (selection.status === 'refused') throw subjectRefusalError(subject, selection.refusal);

    const queue = queueOf(await this.store.listAll());
    if (queue.requested.length >= curationBounds.maxQueued) throw new CurationQueueFullError(queue.requested.length);
    const open = queue.openBySubject.get(subjectKey(subject));
    if (open !== undefined) throw new CurationAlreadyRequestedError(subject.ref, open);

    const now = new Date();
    const spend = decideCurationSpend({
      monthToDateUsd: await this.monthToDateOrNull(now),
      acceptedWorstCaseUsd: request.acceptedWorstCaseUsd,
      costPerMonthUsd: CURATION_MONTH_CEILING_USD,
    });
    if (spend.decision === 'refuse') {
      switch (spend.reason) {
        case 'month-spend-unavailable':
          throw new CurationMonthSpendUnavailableError();
        case 'curation-estimate-changed':
          throw new CurationEstimateChangedError(request.acceptedWorstCaseUsd, curationBounds.maxUsd);
        case 'curation-over-month-ceiling':
          throw new CurationOverMonthCeilingError({
            monthToDateUsd: spend.monthToDateUsd,
            worstCaseUsd: curationBounds.maxUsd,
            costPerMonthUsd: CURATION_MONTH_CEILING_USD,
          });
      }
    }

    const file: CurationFile = CurationFileSchema.parse({
      format: CURATION_FORMAT_VERSION,
      curationId: CurationIdSchema.parse(newUlid(now.getTime())),
      status: 'requested',
      subject,
      ...(request.ownerFocus === undefined ? {} : { ownerFocus: request.ownerFocus }),
      correlationId,
      requestedAt: now.toISOString(),
      attempts: 0,
      spentUsd: 0,
      sessionIds: [],
      updatedAt: now.toISOString(),
    });
    await this.store.createRequested(file);
    this.logger.log({ event: 'curation.requested', curationId: file.curationId, correlationId, subjectKind: subject.kind, subjectRef: subject.ref });
    return this.assembler.viewOf(file, queueOf(await this.store.listAll()), null);
  }

  /** Fail closed: any error reading the month spend is "unknown", never zero. */
  private async monthToDateOrNull(at: Date): Promise<number | null> {
    try {
      return await this.costs.monthToDateUsd(at);
    } catch (error) {
      this.logger.warn({ event: 'curation.month-spend-unavailable', errorName: error instanceof Error ? error.name : 'unknown' });
      return null;
    }
  }
}
