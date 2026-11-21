import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { CancelPublishCommand, PlatformRefusedError, RequestPublishCommand, SyncPublishAttemptsCommand, type PublishSyncSummary } from '@studio/core/platforms';
import {
  PublishRequestSchema,
  type PublishAttemptView,
  type PublishBiometricAssetView,
  type PublishParams,
  type PublishRequest,
} from '@studio/shared/api';
import {
  ARTIFACT_SHA256,
  ATTEMPT_ID,
  IDEMPOTENCY_KEY,
  RUN_ID,
  SENTINEL_CAPTION,
  SENTINEL_TAG,
  SENTINEL_TITLE,
  attemptView,
  principal,
  rejectionOf,
  runPublishView,
  startRev7Bus,
  type Rev7Bus,
} from '../connections/rev7-bus.harness.test';
import { RequestValidationError, ResponseContractViolationError } from '../platform/api.errors';
import { mapError } from '../platform/error-mapping';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { PublishAttemptSync, type PublishSyncCommandPort } from './publish-attempt.sync';
import { PublishResponseAssembler } from './publish-response.assembler';
import { PublishingController } from './publishing.controller';

/*
 * The publish routes (SPEC 0007 sections 4.4 and 5.4, AC 52): POST answers 202 for a new attempt
 * and 200 when the `idempotencyKey` repeats, without waiting for any upload; `requestedBy` comes
 * from the principal; the dialog syncs attempts first; no answer carries a title, a caption or a
 * tag, even when a core view drifts (AC 41, AC 60).
 */

/** The only member of express's `Response` the route touches. */
interface StatusSink {
  status(code: number): unknown;
}

/**
 * The POST route seen through `StatusSink`. A method signature compares parameters bivariantly,
 * so the controller (which declares express's `Response`) is assignable without an assertion.
 */
interface PublishRoute {
  request(params: PublishParams, body: PublishRequest, principal: Principal, response: StatusSink): Promise<PublishAttemptView>;
}

class StatusRecorder implements StatusSink {
  readonly codes: number[] = [];

  status(code: number): this {
    this.codes.push(code);
    return this;
  }
}

const noSync: PublishSyncSummary = { open: 0, updated: 0, expired: 0, linked: 0 };

class RecordingAttemptSync implements PublishSyncCommandPort {
  fail = false;

  constructor(private readonly events: string[]) {}

  async execute(command: SyncPublishAttemptsCommand): Promise<PublishSyncSummary> {
    this.events.push(`sync:${command.runId ?? 'all'}`);
    if (this.fail) throw new Error('state.json unreadable at /Users/owner/.video-studio/platform/publish');
    return noSync;
  }
}

function publishBody(): PublishRequest {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    metadata: { title: SENTINEL_TITLE, caption: SENTINEL_CAPTION, tags: [SENTINEL_TAG], visibility: 'private', aiDisclosure: true },
    biometricRefs: ['voz-ricardo@3'],
    artifactSha256: ARTIFACT_SHA256,
  };
}

function mentionsOwnerText(text: string): boolean {
  return [SENTINEL_TITLE, SENTINEL_CAPTION, SENTINEL_TAG].some((sentinel) => text.includes(sentinel));
}

describe('PublishingController (SPEC 0007 C10 rev 7)', () => {
  let bus: Rev7Bus;
  let events: string[];
  let syncPort: RecordingAttemptSync;
  let controller: PublishingController;
  let route: PublishRoute;

  beforeEach(async () => {
    bus = await startRev7Bus();
    events = [];
    syncPort = new RecordingAttemptSync(events);
    controller = new PublishingController(bus.commandBus, bus.queryBus, new RequestContext(), new PublishAttemptSync(syncPort), new PublishResponseAssembler());
    route = controller;
  });

  afterEach(async () => {
    await bus.close();
  });

  it('declares 202 as the POST status', () => {
    assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, PublishingController.prototype.request), 202);
  });

  it('keeps 202 for a created attempt', async () => {
    bus.core.requestPublish = async () => ({ outcome: 'created', attempt: attemptView() });
    const response = new StatusRecorder();

    const view = await route.request({ runId: RUN_ID, platform: 'youtube' }, publishBody(), principal, response);

    assert.deepEqual(response.codes, []);
    assert.deepEqual(view, attemptView());
  });

  it('answers 200 with the same view when the idempotency key repeats', async () => {
    bus.core.requestPublish = async () => ({ outcome: 'existing', attempt: attemptView() });
    const response = new StatusRecorder();

    const view = await route.request({ runId: RUN_ID, platform: 'youtube' }, publishBody(), principal, response);

    assert.deepEqual(response.codes, [200]);
    assert.equal(view.attemptId, ATTEMPT_ID);
  });

  it('answers 409 publish-idempotency-key-reused when core refuses a reused key with a different body (C9)', async () => {
    bus.core.requestPublish = () => Promise.reject(new PlatformRefusedError('publish-idempotency-key-reused', 'youtube', RUN_ID));
    const response = new StatusRecorder();

    const error = await rejectionOf(route.request({ runId: RUN_ID, platform: 'youtube' }, publishBody(), principal, response));

    assert.ok(error instanceof PlatformRefusedError);
    const mapped = mapError(error);
    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.code, 'conflict');
    assert.equal(mapped.reason, 'publish-idempotency-key-reused');
    assert.equal(mapped.expected, true);
    assert.deepEqual(response.codes, []);
    assert.equal(mentionsOwnerText(JSON.stringify(mapped)), false);
    assert.equal(mentionsOwnerText(bus.logs.text()), false);
  });

  it('records requestedBy from the session and createdBy api', async () => {
    bus.core.requestPublish = async () => ({ outcome: 'created', attempt: attemptView() });

    await route.request({ runId: RUN_ID, platform: 'youtube' }, publishBody(), principal, new StatusRecorder());

    const [command] = bus.core.received.filter((message) => message instanceof RequestPublishCommand);
    assert.ok(command !== undefined);
    assert.equal(command.input.requestedBy, principal.subject);
    assert.equal(command.input.createdBy, 'api');
    assert.equal(command.input.runId, RUN_ID);
    assert.equal(command.input.platform, 'youtube');
  });

  it('refuses a body that tries to supply requestedBy or createdBy', () => {
    const pipe = new ZodValidationPipe(PublishRequestSchema);
    assert.throws(() => pipe.transform({ ...publishBody(), requestedBy: 'attacker' }), RequestValidationError);
    assert.throws(() => pipe.transform({ ...publishBody(), createdBy: 'cli' }), RequestValidationError);
  });

  it('refuses an attempt view carrying the title, caption and tags instead of sending them', async () => {
    const leaky = { ...attemptView(), metadata: publishBody().metadata };
    bus.core.requestPublish = async () => ({ outcome: 'created', attempt: leaky });

    const error = await rejectionOf(route.request({ runId: RUN_ID, platform: 'youtube' }, publishBody(), principal, new StatusRecorder()));

    assert.ok(error instanceof ResponseContractViolationError);
    assert.equal(mentionsOwnerText(bus.logs.text()), false);
  });

  it('answers a created attempt without any of the owner text it was given', async () => {
    bus.core.requestPublish = async () => ({ outcome: 'created', attempt: attemptView() });

    const view = await route.request({ runId: RUN_ID, platform: 'youtube' }, publishBody(), principal, new StatusRecorder());

    assert.equal(mentionsOwnerText(JSON.stringify(view)), false);
    assert.equal(mentionsOwnerText(bus.logs.text()), false);
  });

  it('syncs the run attempts before GET /runs/:runId/publish reads', async () => {
    bus.core.getRunPublish = async () => {
      events.push('query');
      return runPublishView();
    };

    const view = await controller.dialog({ runId: RUN_ID });

    assert.deepEqual(events, [`sync:${RUN_ID}`, 'query']);
    assert.deepEqual(view, runPublishView());
  });

  it('answers the dialog when the attempt sync fails, logging no path', async () => {
    syncPort.fail = true;
    bus.core.getRunPublish = async () => runPublishView();

    assert.deepEqual(await controller.dialog({ runId: RUN_ID }), runPublishView());
    assert.equal(bus.logs.text().includes('/Users/owner'), false);
  });

  it('refuses a dialog view naming a biometric asset by path', async () => {
    const view = runPublishView();
    const kind: PublishBiometricAssetView['kind'] = 'ai-model';
    const leakyAsset = { ref: 'voz-ricardo@3', title: 'Voz do Ricardo', kind, path: '/Users/owner/voz.wav' };
    bus.core.getRunPublish = async () => ({ ...view, biometricAssets: [leakyAsset] });

    assert.ok((await rejectionOf(controller.dialog({ runId: RUN_ID }))) instanceof ResponseContractViolationError);
    assert.equal(bus.logs.text().includes('/Users/owner/voz.wav'), false);
  });

  it('cancels through core with the route ids and answers the strict view', async () => {
    bus.core.cancelPublish = async () => ({ ...attemptView(), state: 'cancelled' });

    const view = await controller.cancel({ runId: RUN_ID, attemptId: ATTEMPT_ID });

    const [command] = bus.core.received.filter((message) => message instanceof CancelPublishCommand);
    assert.deepEqual(command?.input, { runId: RUN_ID, attemptId: ATTEMPT_ID, correlationId: null });
    assert.equal(view.state, 'cancelled');
  });
});
