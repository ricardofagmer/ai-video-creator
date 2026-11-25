import { Logger } from '@nestjs/common';
import { CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { type AssetRef } from '@studio/shared/catalog';
import { AssetJobRequester } from '../asset-job-requester';
import { AssetJobError, AssetJobQueueFullError } from '../asset-jobs.errors';
import { assetPurposeRequest } from '../asset-purpose-request';
import { CountMissingPurposesQuery } from '../queries/count-missing-purposes.query';
import { RequestPurposeBackfillCommand, type PurposeBackfillOutcome } from './request-purpose-backfill.command';

/** Ticket 05 bound: one confirmation never writes more than this many requests. */
const PURPOSE_BACKFILL_MAX = 500;

function errorCodeOf(error: unknown): string {
  if (error instanceof AssetJobError) return error.reason;
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * AP-12: the set comes from the same query as the count, so the jobs written are exactly the
 * versions counted (bounded). Requests go through `AssetJobRequester`, which keeps a job that
 * opened in between and checks the queue cap. Once the queue is full every later request would be
 * refused the same way, so the rest of the batch counts as failed without asking again; the owner
 * can run the backfill again when the watcher has drained the queue. Logs carry refs and codes.
 */
@CommandHandler(RequestPurposeBackfillCommand)
export class RequestPurposeBackfillHandler implements ICommandHandler<RequestPurposeBackfillCommand, PurposeBackfillOutcome> {
  private readonly logger = new Logger(RequestPurposeBackfillHandler.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly requester: AssetJobRequester,
  ) {}

  async execute(): Promise<PurposeBackfillOutcome> {
    const { refs } = await this.queryBus.execute(new CountMissingPurposesQuery());
    const batch = refs.slice(0, PURPOSE_BACKFILL_MAX);
    const outcome: PurposeBackfillOutcome = { requested: 0, failed: 0 };
    for (const [index, ref] of batch.entries()) {
      const result = await this.requestOne(ref);
      if (result === 'requested') {
        outcome.requested += 1;
        continue;
      }
      outcome.failed += 1;
      if (result === 'queue-full') {
        outcome.failed += batch.length - index - 1;
        break;
      }
    }
    this.logger.log({ event: 'asset-purpose.backfill', counted: refs.length, ...outcome });
    return outcome;
  }

  private async requestOne(ref: AssetRef): Promise<'requested' | 'queue-full' | 'failed'> {
    try {
      await this.requester.request(assetPurposeRequest(ref));
      return 'requested';
    } catch (error) {
      this.logger.warn({ event: 'asset-job.enqueue-failed', kind: 'asset-purpose', ref, errorCode: errorCodeOf(error) });
      return error instanceof AssetJobQueueFullError ? 'queue-full' : 'failed';
    }
  }
}
