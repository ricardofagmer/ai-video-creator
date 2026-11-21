import 'reflect-metadata';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Logger } from '@nestjs/common';
import { SyncPublishAttemptsCommand, type PublishSyncSummary } from '@studio/core/platforms';
import { CapturingLogger, RUN_ID } from '../connections/rev7-bus.harness.test';
import { PublishAttemptSync, type PublishSyncCommandPort } from './publish-attempt.sync';

/*
 * `PublishAttemptSync` (SPEC 0007 section 5.4 "Result"): all open attempts when the api starts,
 * one run's attempts before `GET /runs/:runId/publish` and `GET /runs/:runId/publications`; a
 * failed pass never fails the read and is retried by the next one. The read order itself is proven
 * in publishing.controller.test.ts and metrics/metric-inbox.sync.test.ts.
 */

const OTHER_RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1D';

/** Core's `SyncPublishAttempts` handler at the bus boundary; fails while `failures` is above zero. */
class RecordingSyncHandler implements PublishSyncCommandPort {
  readonly runIds: (string | null)[] = [];
  failures = 0;

  async execute(command: SyncPublishAttemptsCommand): Promise<PublishSyncSummary> {
    this.runIds.push(command.runId);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('state.json of /Users/owner/.video-studio/platform/publish/01JD/state.json is unreadable');
    }
    return { open: 1, updated: 1, expired: 0, linked: 1 };
  }
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await new Promise<void>((done) => setImmediate(done));
}

describe('PublishAttemptSync (SPEC 0007 section 5.4)', () => {
  let handler: RecordingSyncHandler;
  let sync: PublishAttemptSync;
  let logs: CapturingLogger;

  beforeEach(() => {
    logs = new CapturingLogger();
    Logger.overrideLogger(logs);
    handler = new RecordingSyncHandler();
    sync = new PublishAttemptSync(handler);
  });

  it('syncs every open attempt when the api starts', async () => {
    sync.onApplicationBootstrap();
    await settle();

    assert.deepEqual(handler.runIds, [null]);
  });

  it('syncs only the run being read before its read answers', async () => {
    await sync.syncBeforeRead(RUN_ID);

    assert.deepEqual(handler.runIds, [RUN_ID]);
  });

  it('never rejects when the pass fails, and logs the error name without its message', async () => {
    handler.failures = 1;

    await sync.syncBeforeRead(RUN_ID);

    assert.match(logs.text(), /publish\.attempts-sync-failed/);
    assert.equal(logs.text().includes('/Users/owner'), false);
  });

  it('retries a failed run on its next read', async () => {
    handler.failures = 1;
    await sync.syncBeforeRead(RUN_ID);
    await sync.syncBeforeRead(RUN_ID);

    assert.deepEqual(handler.runIds, [RUN_ID, RUN_ID]);
    assert.match(logs.text(), /publish\.attempts-synced/);
  });

  it('resolves every overlapping caller even when one of their passes fails', async () => {
    handler.failures = 1;

    const outcomes = await Promise.allSettled([sync.syncBeforeRead(RUN_ID), sync.syncBeforeRead(RUN_ID), sync.syncBeforeRead(OTHER_RUN_ID)]);

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ['fulfilled', 'fulfilled', 'fulfilled'],
    );
    assert.ok(handler.runIds.includes(OTHER_RUN_ID), 'another run is still synced');
  });
});
