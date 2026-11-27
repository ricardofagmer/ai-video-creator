import { Injectable, Logger } from '@nestjs/common';
import { ASSET_JOB_QUEUE_MAX, type AssetJobKind } from '@studio/shared/asset-jobs';
import { AssetJobOpenError } from '@studio/shared/asset-jobs/files';
import { type AssetRef } from '@studio/shared/catalog';
import { SerialMutex } from '../runtime/keyed-mutex';
import { AssetJobStore, type AssetJobFileOf } from './asset-job-store';
import { AssetJobFileCorruptError, AssetJobQueueFullError } from './asset-jobs.errors';

/** What to do with the version's current job: return it as it is, or write a new request. */
export type AssetJobDecision = 'keep' | 'replace';

export interface AssetJobRequest<Kind extends AssetJobKind> {
  kind: Kind;
  ref: AssetRef;
  /** Called only for a present job, inside the serialized section; an absent one is always requested. */
  decide: (current: AssetJobFileOf[Kind]) => AssetJobDecision | Promise<AssetJobDecision>;
  /** The `requested` file; `at` is the request time. */
  build: (at: Date) => AssetJobFileOf[Kind];
}

/**
 * The api's request path of both job kinds: read the current job, decide, check the queue, write.
 * Requests of one api process are serialized so the queue count and the write cannot interleave;
 * the watcher only ever moves a job out of `requested`, so a count can only be too high, never too
 * low. A refusal writes nothing.
 */
@Injectable()
export class AssetJobRequester {
  private readonly logger = new Logger(AssetJobRequester.name);
  private readonly requests = new SerialMutex();

  constructor(private readonly store: AssetJobStore) {}

  request<Kind extends AssetJobKind>(request: AssetJobRequest<Kind>): Promise<AssetJobFileOf[Kind]> {
    // The mutex only orders the requests; each caller still receives its own result or error.
    return this.requests.run(() => this.requestNow(request));
  }

  private async requestNow<Kind extends AssetJobKind>(request: AssetJobRequest<Kind>): Promise<AssetJobFileOf[Kind]> {
    const { kind, ref } = request;
    const current = await this.store.read(kind, ref);
    if (current.status === 'present' && (await request.decide(current.job)) === 'keep') return current.job;

    const queued = await this.store.countRequested(kind);
    if (queued >= ASSET_JOB_QUEUE_MAX) throw new AssetJobQueueFullError(kind, queued);

    // Old clips go before the new request exists: once it does, the watcher may write the new clip.
    if (kind === 'voice-sample' && current.status === 'present') await this.store.removeSamples(ref);

    const file = request.build(new Date());
    try {
      await this.store.writeRequested(file);
    } catch (error) {
      if (!(error instanceof AssetJobOpenError)) throw error;
      // Another request reopened the job between the read and the write: return that job.
      const reopened = await this.store.read(kind, ref);
      if (reopened.status === 'present') return reopened.job;
      throw new AssetJobFileCorruptError(kind, ref);
    }
    this.logger.log({
      event: 'asset-job.requested',
      kind,
      ref,
      replaced: current.status === 'present' ? current.job.status : 'none',
      queued: queued + 1,
    });
    return file;
  }
}
