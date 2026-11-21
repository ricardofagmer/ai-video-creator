import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Logger } from '@nestjs/common';
import { GetStudioInsightsQuery } from '@studio/core/insights';
import { IngestMetricBatchCommand, type MetricBatchIngestSummary } from '@studio/core/metrics';
import { type InsightsView } from '@studio/shared/api';
import { CapturingLogger, RUN_ID, principal, rejectionOf, startRev7Bus, type Rev7Bus } from '../connections/rev7-bus.harness.test';
import { InsightsController, type InsightsQueryPort } from '../insights/insights.controller';
import { RequestContext } from '../platform/request-context';
import { PublishAttemptSync } from '../publishing/publish-attempt.sync';
import { MetricInboxSync, type MetricBatchCommandPort } from './metric-inbox.sync';
import { MetricsResponseAssembler } from './metrics-response.assembler';
import { RunPublicationsController } from './run-publications.controller';

/*
 * `MetricInboxSync` (SPEC 0007 section 5.6): it drains the watcher's inbox through core
 * `IngestMetricBatch` before `GET /runs/:runId/publications`, `GET /platforms` and `GET /insights`
 * answer; a failed pass never fails the read; overlapping callers share passes. The `GET /platforms`
 * order is proven in connections/platforms.controller.test.ts.
 */

const summary: MetricBatchIngestSummary = { ingested: 1, duplicates: 0, refused: 0, scoreRecomputed: true };

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Core's ingest handler at the bus boundary: each pass can be held open until the test releases it. */
class ControlledIngest implements MetricBatchCommandPort {
  readonly commands: IngestMetricBatchCommand[] = [];
  readonly events: string[] = [];
  readonly gates: Deferred[] = [];
  holdPasses = false;
  failWith: Error | null = null;

  async execute(command: IngestMetricBatchCommand): Promise<MetricBatchIngestSummary> {
    const pass = this.commands.push(command);
    this.events.push(`start:${pass}`);
    if (this.holdPasses) {
      const gate = deferred();
      this.gates.push(gate);
      await gate.promise;
    }
    this.events.push(`end:${pass}`);
    if (this.failWith !== null) throw this.failWith;
    return summary;
  }

  release(pass: number): void {
    const gate = this.gates[pass - 1];
    assert.ok(gate !== undefined, `pass ${pass} never started`);
    gate.resolve();
  }
}

/** Lets pending promise callbacks run. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await new Promise<void>((done) => setImmediate(done));
}

describe('MetricInboxSync (SPEC 0007 section 5.6)', () => {
  let ingest: ControlledIngest;
  let context: RequestContext;
  let sync: MetricInboxSync;
  let logs: CapturingLogger;

  beforeEach(() => {
    logs = new CapturingLogger();
    Logger.overrideLogger(logs);
    ingest = new ControlledIngest();
    context = new RequestContext();
    sync = new MetricInboxSync(ingest, context);
  });

  it('drains every inbox file with the request correlation id', async () => {
    await new Promise<void>((resolve, reject) => {
      context.run({ correlationId: 'req-inbox-1', principal }, () => {
        sync.syncBeforeRead().then(resolve, reject);
      });
    });

    assert.deepEqual(ingest.commands.map((command) => command.input), [{ batchId: null, correlationId: 'req-inbox-1' }]);
  });

  it('drains the inbox once when the api starts', async () => {
    sync.onApplicationBootstrap();
    await settle();

    assert.equal(ingest.commands.length, 1);
  });

  it('never rejects when the pass fails, and logs the error name without its message', async () => {
    ingest.failWith = new Error('cannot read /Users/owner/.video-studio/platform/metrics-inbox/01JD.json');

    await sync.syncBeforeRead();

    assert.equal(logs.text().includes('metrics-inbox/01JD.json'), false);
    assert.match(logs.text(), /metrics\.inbox-sync-failed/);
  });

  it('retries on the next read after a failed pass', async () => {
    ingest.failWith = new Error('busy');
    await sync.syncBeforeRead();
    ingest.failWith = null;
    await sync.syncBeforeRead();

    assert.equal(ingest.commands.length, 2);
  });

  it('coalesces overlapping callers into one follow-up pass that starts after the running one', async () => {
    ingest.holdPasses = true;
    const first = sync.syncBeforeRead();
    await settle();

    const waiting = [sync.syncBeforeRead(), sync.syncBeforeRead(), sync.syncBeforeRead()];
    await settle();
    assert.equal(ingest.commands.length, 1, 'no second pass starts while the first runs');

    ingest.release(1);
    await first;
    await settle();
    assert.equal(ingest.commands.length, 2, 'exactly one follow-up pass serves every waiting caller');

    let waitingSettled = false;
    void Promise.all(waiting).then(() => {
      waitingSettled = true;
    });
    await settle();
    assert.equal(waitingSettled, false, 'the waiting callers resolve only after the follow-up pass ends');

    ingest.release(2);
    await Promise.all(waiting);
    assert.deepEqual(ingest.events, ['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('starts a new pass for a caller that arrives after every pass ended', async () => {
    await sync.syncBeforeRead();
    await sync.syncBeforeRead();

    assert.equal(ingest.commands.length, 2);
  });
});

describe('the reads that sync first (SPEC 0007 sections 5.4 and 5.6)', () => {
  let bus: Rev7Bus;

  beforeEach(async () => {
    bus = await startRev7Bus();
  });

  afterEach(async () => {
    await bus.close();
  });

  it('GET /runs/:runId/publications syncs attempts, then the inbox, then reads', async () => {
    const events: string[] = [];
    const context = new RequestContext();
    const attempts = new PublishAttemptSync({
      execute: async (command) => {
        events.push(`attempts:${command.runId ?? 'all'}`);
        return { open: 0, updated: 0, expired: 0, linked: 0 };
      },
    });
    const inbox = new MetricInboxSync(
      {
        execute: async () => {
          events.push('inbox');
          return summary;
        },
      },
      context,
    );
    bus.core.getRunPublications = async () => {
      events.push('query');
      throw new Error('stop after the read');
    };
    const controller = new RunPublicationsController(bus.commandBus, bus.queryBus, context, new MetricsResponseAssembler(), attempts, inbox);

    await rejectionOf(controller.list({ runId: RUN_ID }));

    assert.deepEqual(events, [`attempts:${RUN_ID}`, 'inbox', 'query']);
  });

  it('GET /insights drains the inbox before it reads', async () => {
    const events: string[] = [];
    const inbox = new MetricInboxSync(
      {
        execute: async () => {
          events.push('inbox');
          return summary;
        },
      },
      new RequestContext(),
    );
    const queries: InsightsQueryPort = {
      execute: (query: GetStudioInsightsQuery): Promise<InsightsView> => {
        events.push(`query:${query.constructor.name}`);
        return Promise.reject(new Error('stop after the read'));
      },
    };

    await rejectionOf(new InsightsController(queries, inbox).read());

    assert.deepEqual(events, ['inbox', 'query:GetStudioInsightsQuery']);
  });
});
