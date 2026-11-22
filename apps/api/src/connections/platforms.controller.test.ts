import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { IngestMetricBatchCommand, type MetricBatchIngestSummary } from '@studio/core/metrics';
import { SetPlatformGateCommand, StartConnectionCommand } from '@studio/core/platforms';
import { GateChangeRequestSchema } from '@studio/shared/api';
import { MetricInboxSync, type MetricBatchCommandPort } from '../metrics/metric-inbox.sync';
import { RequestValidationError, ResponseContractViolationError } from '../platform/api.errors';
import { ApiConfig } from '../platform/api-config';
import { RequestContext } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { PlatformResponseAssembler } from './platform-response.assembler';
import { PlatformsController } from './platforms.controller';
import {
  API_PORT,
  SENTINEL_CLIENT_SECRET,
  SENTINEL_TOKEN,
  WEB_ORIGIN,
  platformView,
  platformsView,
  principal,
  rejectionOf,
  startRev7Bus,
  type Rev7Bus,
} from './rev7-bus.harness.test';

/*
 * The owner's platform routes (SPEC 0007 sections 4.4, 5.2, 5.3 and 5.6): `GET /platforms` ingests
 * the watcher's batches before it reads and never fails because of them; actors and the session
 * binding come from the principal; every answer passes its strict C10 schema, so a token or a
 * client secret drifting into a core view is refused instead of sent (AC 41, AC 60).
 */

const emptySummary: MetricBatchIngestSummary = { ingested: 0, duplicates: 0, refused: 0, scoreRecomputed: false };

class RecordingInbox implements MetricBatchCommandPort {
  fail = false;

  constructor(private readonly events: string[]) {}

  async execute(command: IngestMetricBatchCommand): Promise<MetricBatchIngestSummary> {
    this.events.push(`inbox:${command.input.batchId ?? 'all'}`);
    if (this.fail) throw new Error('inbox unreadable');
    return emptySummary;
  }
}

describe('PlatformsController (SPEC 0007 C10 rev 7)', () => {
  let bus: Rev7Bus;
  let events: string[];
  let inboxPort: RecordingInbox;
  let controller: PlatformsController;

  beforeEach(async () => {
    bus = await startRev7Bus();
    events = [];
    inboxPort = new RecordingInbox(events);
    const context = new RequestContext();
    const inbox = new MetricInboxSync(inboxPort, context);
    controller = new PlatformsController(bus.commandBus, bus.queryBus, context, new ApiConfig(API_PORT, WEB_ORIGIN), inbox, new PlatformResponseAssembler());
  });

  afterEach(async () => {
    await bus.close();
  });

  it('ingests the metrics inbox before GET /platforms reads', async () => {
    bus.core.getPlatforms = async () => {
      events.push('query');
      return platformsView();
    };

    const view = await controller.list();

    assert.deepEqual(events, ['inbox:all', 'query']);
    assert.deepEqual(view, platformsView());
  });

  it('answers GET /platforms when the inbox pass fails', async () => {
    inboxPort.fail = true;
    bus.core.getPlatforms = async () => platformsView();

    assert.deepEqual(await controller.list(), platformsView());
    assert.equal(bus.logs.text().includes('inbox unreadable'), false);
  });

  it('refuses a platforms view carrying a token instead of sending it', async () => {
    const leaky = { ...platformView('youtube'), accessToken: SENTINEL_TOKEN };
    bus.core.getPlatforms = async () => ({ platforms: [leaky, platformView('instagram'), platformView('tiktok')] });

    const error = await rejectionOf(controller.list());

    assert.ok(error instanceof ResponseContractViolationError);
    assert.equal(bus.logs.text().includes(SENTINEL_TOKEN), false);
  });

  it('records the gate change as the session owner, never a body field', async () => {
    bus.core.setGate = async (command) => platformView(command.input.platform);

    await controller.changeGate({ platform: 'tiktok' }, { capability: 'metrics', state: 'enabled' }, principal);

    const [command] = bus.core.received.filter((message) => message instanceof SetPlatformGateCommand);
    assert.ok(command !== undefined);
    assert.equal(command.input.updatedBy, principal.subject);
    assert.throws(
      () => new ZodValidationPipe(GateChangeRequestSchema).transform({ capability: 'metrics', state: 'enabled', updatedBy: 'attacker' }),
      RequestValidationError,
    );
  });

  it('binds a new connection to the session id and the configured api port', async () => {
    bus.core.startConnection = async () => ({
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc&code_challenge=xyz',
      expiresAt: '2026-11-20T10:10:00.000Z',
    });

    const view = await controller.startConnection({ platform: 'youtube' }, principal);

    const [command] = bus.core.received.filter((message) => message instanceof StartConnectionCommand);
    assert.ok(command !== undefined);
    assert.deepEqual(command.input, { platform: 'youtube', sessionId: principal.sessionId, apiPort: API_PORT, correlationId: null });
    assert.equal(view.expiresAt, '2026-11-20T10:10:00.000Z');
  });

  it('takes the correlation id from x-request-id through the request context', async () => {
    const context = new RequestContext();
    const scoped = new PlatformsController(bus.commandBus, bus.queryBus, context, new ApiConfig(API_PORT, WEB_ORIGIN), new MetricInboxSync(inboxPort, context), new PlatformResponseAssembler());
    bus.core.startConnection = async () => ({ authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/?state=abc', expiresAt: '2026-11-20T10:10:00.000Z' });

    await new Promise<void>((resolve, reject) => {
      context.run({ correlationId: 'req-platforms-1', principal }, () => {
        scoped.startConnection({ platform: 'tiktok' }, principal).then(() => resolve(), reject);
      });
    });

    const [command] = bus.core.received.filter((message) => message instanceof StartConnectionCommand);
    assert.equal(command?.input.correlationId, 'req-platforms-1');
  });

  it('refuses a connection start view carrying a client secret', async () => {
    const leaky = { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc', expiresAt: '2026-11-20T10:10:00.000Z', clientSecret: SENTINEL_CLIENT_SECRET };
    bus.core.startConnection = async () => leaky;

    const error = await rejectionOf(controller.startConnection({ platform: 'youtube' }, principal));

    assert.ok(error instanceof ResponseContractViolationError);
    assert.equal(bus.logs.text().includes(SENTINEL_CLIENT_SECRET), false);
  });

  it('refuses an authorize URL that is neither https nor the loopback callback', async () => {
    bus.core.startConnection = async () => ({ authorizeUrl: 'http://evil.example/authorize', expiresAt: '2026-11-20T10:10:00.000Z' });

    assert.ok((await rejectionOf(controller.startConnection({ platform: 'youtube' }, principal))) instanceof ResponseContractViolationError);
  });

  it('refuses a disconnect view carrying a refresh token', async () => {
    const leaky = { ...platformView('youtube'), revoke: 'skipped' as const, refreshToken: SENTINEL_TOKEN };
    bus.core.disconnect = async () => leaky;

    const error = await rejectionOf(controller.disconnect({ platform: 'youtube' }));

    assert.ok(error instanceof ResponseContractViolationError);
    assert.equal(bus.logs.text().includes(SENTINEL_TOKEN), false);
  });

  it('answers a disconnect with the strict platform view and the revoke outcome', async () => {
    bus.core.disconnect = async () => ({ ...platformView('youtube'), status: { metrics: 'disconnected', publish: 'disconnected' }, accountLabel: null, connectedAt: null, revoke: 'revoked' });

    const view = await controller.disconnect({ platform: 'youtube' });

    assert.equal(view.status.metrics, 'disconnected');
    assert.equal(view.revoke, 'revoked');
    assert.equal(JSON.stringify(view).includes(SENTINEL_TOKEN), false);
  });
});
