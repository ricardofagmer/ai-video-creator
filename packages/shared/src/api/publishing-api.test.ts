import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiRev7ErrorReasonSchema, apiRev7ErrorReasons, apiRev7ErrorTexts } from './common';
import {
  PublishAttemptParamsSchema,
  PublishAttemptViewSchema,
  PublishBiometricAssetViewSchema,
  PublishParamsSchema,
  PublishPlatformViewSchema,
  PublishRequestSchema,
  RunPublishViewSchema,
  type PublishAttemptView,
  type PublishPlatformView,
  type PublishRequest,
} from './publishing';

/*
 * C10 rev 7 publish contracts (SPEC 0007 sections 4.4 and 5.4; AC 46, AC 47, OD4, OD8). Strict
 * schemas: no response may carry a title, caption, tag, URL or path.
 */

const RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1D';

function publishRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    idempotencyKey: '01JD2Q7F3M8V5K9X4T6R2N0B1E',
    metadata: { title: 'Tour do produto', caption: 'Legenda', tags: ['tour', 'produto_2026'], visibility: 'private', aiDisclosure: true },
    biometricRefs: ['voz-ricardo@3'],
    artifactSha256: 'c'.repeat(64),
    ...overrides,
  };
}

function attemptView(overrides: Partial<PublishAttemptView> = {}): PublishAttemptView {
  return {
    attemptId: ATTEMPT_ID,
    runId: RUN_ID,
    platform: 'youtube',
    mode: 'mock',
    state: 'queued',
    since: '2026-11-20T10:00:00.000Z',
    bytesSent: 0,
    bytesTotal: 1024,
    reasonId: null,
    expiresAt: '2026-11-20T12:00:00.000Z',
    publicationId: null,
    requestedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

function platformTab(overrides: Partial<PublishPlatformView> = {}): PublishPlatformView {
  return {
    platform: 'youtube',
    mode: 'mock',
    status: 'connected',
    eligible: true,
    refusal: null,
    allowedVisibilities: ['public', 'unlisted', 'private'],
    publicationId: null,
    ...overrides,
  };
}

describe('publish request body', () => {
  it('parses the documented body', () => {
    assert.equal(PublishRequestSchema.safeParse(publishRequest()).success, true);
  });

  it('refuses an extra field, a non-ULID key and an uppercase hash', () => {
    assert.equal(PublishRequestSchema.safeParse({ ...publishRequest(), requestedBy: 'x' }).success, false);
    assert.equal(PublishRequestSchema.safeParse(publishRequest({ idempotencyKey: 'click-1' })).success, false);
    assert.equal(PublishRequestSchema.safeParse(publishRequest({ artifactSha256: 'C'.repeat(64) })).success, false);
  });

  it('refuses metadata outside the bounds: empty title, long title, tag with a URL, too many tags', () => {
    const metadata = publishRequest().metadata;
    const refuses = (changed: Partial<PublishRequest['metadata']>): boolean =>
      !PublishRequestSchema.safeParse(publishRequest({ metadata: { ...metadata, ...changed } })).success;
    assert.equal(refuses({ title: '   ' }), true);
    assert.equal(refuses({ title: 't'.repeat(101) }), true);
    assert.equal(refuses({ tags: ['https://x.invalid'] }), true);
    assert.equal(refuses({ tags: ['a b'] }), true);
    assert.equal(refuses({ tags: Array.from({ length: 31 }, (_, index) => `tag${index}`) }), true);
    assert.equal(refuses({ caption: 'c'.repeat(2201) }), true);
    assert.equal(refuses({ title: 't'.repeat(100), caption: 'c'.repeat(2200) }), false);
  });

  it('refuses a biometric ref that is a path instead of id@version', () => {
    assert.equal(PublishRequestSchema.safeParse(publishRequest({ biometricRefs: ['/Users/x/voz.wav'] })).success, false);
    assert.equal(PublishRequestSchema.safeParse(publishRequest({ biometricRefs: ['voz-ricardo'] })).success, false);
  });
});

describe('publish params and views', () => {
  it('parses params and refuses an invalid attempt id or platform', () => {
    assert.equal(PublishParamsSchema.safeParse({ runId: RUN_ID, platform: 'tiktok' }).success, true);
    assert.equal(PublishParamsSchema.safeParse({ runId: RUN_ID, platform: 'x' }).success, false);
    assert.equal(PublishAttemptParamsSchema.safeParse({ runId: RUN_ID, attemptId: ATTEMPT_ID }).success, true);
    assert.equal(PublishAttemptParamsSchema.safeParse({ runId: RUN_ID, attemptId: '../x' }).success, false);
  });

  it('parses an attempt view and refuses one carrying a title or URL', () => {
    assert.equal(PublishAttemptViewSchema.safeParse(attemptView()).success, true);
    assert.equal(PublishAttemptViewSchema.safeParse({ ...attemptView(), title: 'Tour' }).success, false);
    assert.equal(PublishAttemptViewSchema.safeParse({ ...attemptView(), url: 'https://youtu.be/x' }).success, false);
  });

  it('names a biometric asset by ref, title and kind, never by path (AC 46)', () => {
    assert.equal(PublishBiometricAssetViewSchema.safeParse({ ref: 'voz-ricardo@3', title: 'Voz', kind: 'ai-model' }).success, true);
    assert.equal(
      PublishBiometricAssetViewSchema.safeParse({ ref: 'voz-ricardo@3', title: 'Voz', kind: 'ai-model', path: '/x' }).success,
      false,
    );
  });

  it('sets refusal exactly when a tab is not eligible; Instagram reads unsupported (OD8)', () => {
    const instagram = platformTab({
      platform: 'instagram',
      status: 'unsupported',
      eligible: false,
      refusal: 'platform-publish-unsupported',
      allowedVisibilities: [],
    });
    assert.equal(PublishPlatformViewSchema.safeParse(instagram).success, true);
    assert.equal(PublishPlatformViewSchema.safeParse({ ...instagram, refusal: null }).success, false);
    assert.equal(PublishPlatformViewSchema.safeParse(platformTab({ refusal: 'platform-not-connected' })).success, false);
  });

  it('requires three tabs and at most ten attempts in the run publish view', () => {
    const view = {
      runId: RUN_ID,
      approved: true,
      artifact: { sha256: 'c'.repeat(64), sizeBytes: 1024 },
      biometricAssets: [],
      platforms: [platformTab(), platformTab({ platform: 'instagram', status: 'unsupported', eligible: false, refusal: 'platform-publish-unsupported' }), platformTab({ platform: 'tiktok' })],
      attempts: [attemptView()],
      leftTheMachine: [],
    };
    assert.equal(RunPublishViewSchema.safeParse(view).success, true);
    assert.equal(RunPublishViewSchema.safeParse({ ...view, platforms: view.platforms.slice(0, 2) }).success, false);
    assert.equal(RunPublishViewSchema.safeParse({ ...view, attempts: Array.from({ length: 11 }, () => attemptView()) }).success, false);
    assert.equal(RunPublishViewSchema.safeParse({ ...view, finalVideoPath: '/x/final.mp4' }).success, false);
  });
});

describe('reused idempotency key refusal (review finding C9)', () => {
  it('is a rev 7 reason the error body may carry', () => {
    assert.equal(ApiRev7ErrorReasonSchema.safeParse('publish-idempotency-key-reused').success, true);
  });

  it('answers 409, like the other publish conflicts', () => {
    assert.equal(apiRev7ErrorReasons['publish-idempotency-key-reused'], 409);
  });

  it('carries the pt-BR text the web and the CLI both show, with no placeholder left to fill', () => {
    const text = apiRev7ErrorTexts['publish-idempotency-key-reused'];

    assert.equal(text, 'Este pedido de publicação já foi enviado com outros dados. Abra o diálogo de novo e envie outra vez.');
    assert.doesNotMatch(text, /\{[a-z]+\}/);
  });
});
