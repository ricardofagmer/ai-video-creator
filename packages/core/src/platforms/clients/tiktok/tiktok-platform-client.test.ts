import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SecretToken } from '../../token-bundle';
import {
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_AUTHORIZATION_CODE,
  SENTINEL_CLIENT_ID,
  SENTINEL_CLIENT_SECRET,
  SENTINEL_REFRESH_TOKEN,
  sentinelTokenBundle,
} from '../../token-fixtures.harness.test';
import {
  ScriptedFetch,
  createVideoFile,
  emptyResponse,
  formOf,
  jsonOf,
  jsonResponse,
  metricTarget,
  rejectsWithReason,
  sentinelCredentials,
  textResponse,
  transportFailure,
  videoBytes,
  type ScriptStep,
  type VideoFile,
} from '../live-client.harness.test';
import { type MetricsRequest, type UploadRequest } from '../platform-client.port';
import { chunkRanges, planChunks } from './tiktok-chunks';
import { TiktokPlatformClient } from './tiktok-platform-client';

/*
 * The live TikTok client against a scripted `fetch` (SPEC 0007 sections 5.1, 5.2, 5.4, 5.5, 5.7;
 * ticket R4-09): Login Kit with a hex PKCE challenge, the inbox draft upload and the video query.
 * No request leaves the process and the B9 waits are recorded, not slept.
 */

const NOW = new Date('2026-11-20T10:00:00.000Z');
const REDIRECT = 'http://127.0.0.1:4310/connections/tiktok/callback';
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const PUBLISH_ID = 'v_inbox_file~v2.123456789';
const UPLOAD_URL = 'https://open-upload.tiktokapis.com/upload/?upload_id=7000&upload_token=upload-token-value';
/** 19 digits: beyond 2^53, so `JSON.parse` would round it without `quotePostIds`. */
const POST_ID = '7311234567890123456';
const VERIFIER = 'pkce-verifier-for-tests-only-not-a-secret-value-qqqq';

interface Harness {
  fake: ScriptedFetch;
  client: TiktokPlatformClient;
  waits: number[];
}

function harness(steps: readonly ScriptStep[]): Harness {
  const fake = new ScriptedFetch(steps);
  const waits: number[] = [];
  const client = new TiktokPlatformClient({
    context: { fetch: fake.fetch },
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });
  return { fake, client, waits };
}

function ok(data: unknown): Response {
  return jsonResponse(200, { data, error: { code: 'ok', message: '', log_id: 'log-1' } });
}

function apiError(status: number, code: string, headers: Record<string, string> = {}): Response {
  return jsonResponse(status, { error: { code, message: 'platform text that must be dropped', log_id: 'log-2' } }, headers);
}

function tokenSuccess(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(200, {
    access_token: 'new-access-token-value',
    expires_in: 86_400,
    open_id: 'open-id-1',
    refresh_token: 'new-refresh-token-value',
    refresh_expires_in: 31_536_000,
    scope: 'user.info.basic,video.list',
    token_type: 'Bearer',
    ...overrides,
  });
}

/** The status-fetch body with the post id as a bare int64, exactly as [T8] types it. */
function statusAnswer(status: string, extra = ''): Response {
  return textResponse(200, `{"data":{"status":"${status}"${extra}},"error":{"code":"ok","message":""}}`, { 'content-type': 'application/json' });
}

describe('TiktokPlatformClient: connect, scopes and links', () => {
  it('asks for user.info.basic plus each capability scope, never video.publish', () => {
    const { client } = harness([]);
    assert.equal(client.pkce, 'hex');
    assert.deepEqual(client.scopesFor(['metrics', 'publish']), ['user.info.basic', 'video.list', 'video.upload']);
    assert.ok(!client.scopesFor(['metrics', 'publish']).includes('video.publish'));
  });

  it('builds no publication URL, since the label is a display name and not a handle', () => {
    assert.equal(harness([]).client.publicationUrl(), null);
  });

  it('puts the client key, state and S256 challenge in the authorize URL, never the secret', () => {
    const href = harness([]).client.authorizeUrl({
      credentials: sentinelCredentials('tiktok'),
      redirectUri: REDIRECT,
      state: 'state-value-1',
      challenge: 'abcdef0123',
      scopes: ['user.info.basic', 'video.list'],
    });
    const url = new URL(href);
    assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
    assert.equal(url.searchParams.get('client_key'), SENTINEL_CLIENT_ID);
    assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.list');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(!href.includes(SENTINEL_CLIENT_SECRET));
  });

  it('refuses an authorize URL without a PKCE challenge or credentials', () => {
    const base = { credentials: sentinelCredentials('tiktok'), redirectUri: REDIRECT, state: 's', challenge: 'c', scopes: ['user.info.basic'] };
    const { client } = harness([]);
    assert.throws(() => client.authorizeUrl({ ...base, challenge: null }), { reason: 'exchange-failed' });
    assert.throws(() => client.authorizeUrl({ ...base, credentials: null }), { reason: 'exchange-failed' });
  });
});

describe('TiktokPlatformClient: tokens', () => {
  const exchange = {
    code: new SecretToken(SENTINEL_AUTHORIZATION_CODE),
    verifier: new SecretToken(VERIFIER),
    redirectUri: REDIRECT,
    credentials: sentinelCredentials('tiktok'),
    connectionId: '01JD2Q7F3M8V5K9X4T6R2N0C0N',
    now: NOW,
  };

  it('exchanges the code with the verifier in a form body and stores the returned lifetimes', async () => {
    const { client, fake } = harness([() => tokenSuccess()]);
    const bundle = await client.exchangeCode(exchange);
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    const form = formOf(fake.requests[0]);
    assert.equal(fake.requests[0]?.url.href, 'https://open.tiktokapis.com/v2/oauth/token/');
    assert.equal(form.get('client_key'), SENTINEL_CLIENT_ID);
    assert.equal(form.get('client_secret'), SENTINEL_CLIENT_SECRET);
    assert.equal(form.get('code'), SENTINEL_AUTHORIZATION_CODE);
    assert.equal(form.get('code_verifier'), VERIFIER);
    assert.equal(bundle.accessExpiresAt, '2026-11-21T10:00:00.000Z');
    assert.equal(bundle.refreshExpiresAt, '2027-11-20T10:00:00.000Z');
    assert.deepEqual(bundle.scopes, ['user.info.basic', 'video.list']);
  });

  it('maps refused exchanges, including an error body sent with status 200', async () => {
    await rejectsWithReason(harness([() => jsonResponse(400, { error: 'invalid_grant' })]).client.exchangeCode(exchange), 'exchange-failed');
    await rejectsWithReason(harness([() => jsonResponse(200, { error: 'access_denied', error_description: 'no' })]).client.exchangeCode(exchange), 'denied');
    await rejectsWithReason(harness([() => jsonResponse(503, { error: 'server_error' })]).client.exchangeCode(exchange), 'platform-unavailable');
    await rejectsWithReason(harness([() => tokenSuccess({ scope: 'User Info' })]).client.exchangeCode(exchange), 'invalid-response');
    await rejectsWithReason(harness([() => tokenSuccess({ refresh_token: undefined })]).client.exchangeCode(exchange), 'invalid-response');
  });

  it('replaces the spent refresh token with the rotated one', async () => {
    const { client, fake } = harness([() => tokenSuccess()]);
    const refreshed = await client.refresh(sentinelTokenBundle('tiktok'), sentinelCredentials('tiktok'), NOW);
    fake.assertFinished();
    assert.equal(formOf(fake.requests[0]).get('refresh_token'), SENTINEL_REFRESH_TOKEN);
    assert.equal(refreshed.refreshToken?.revealForPlatformCall(), 'new-refresh-token-value');
    assert.equal(refreshed.refreshExpiresAt, '2027-11-20T10:00:00.000Z');
  });

  it('reads invalid_grant on a refresh by the stored refresh expiry', async () => {
    const credentials = sentinelCredentials('tiktok');
    const expired = sentinelTokenBundle('tiktok', { refreshExpiresAt: '2026-11-19T00:00:00.000Z' });
    await rejectsWithReason(harness([() => jsonResponse(400, { error: 'invalid_grant' })]).client.refresh(expired, credentials, NOW), 'refresh-expired');
    await rejectsWithReason(
      harness([() => jsonResponse(400, { error: 'invalid_grant' })]).client.refresh(sentinelTokenBundle('tiktok'), credentials, NOW),
      'token-revoked',
    );
    await rejectsWithReason(harness([]).client.refresh(sentinelTokenBundle('tiktok', { refreshToken: null }), credentials, NOW), 'refresh-expired');
  });

  it('revokes the access token and accepts an empty or empty-object answer', async () => {
    const empty = harness([() => textResponse(200, '')]);
    await empty.client.revoke(sentinelTokenBundle('tiktok'), sentinelCredentials('tiktok'));
    assert.equal(formOf(empty.fake.requests[0]).get('token'), SENTINEL_ACCESS_TOKEN);
    await harness([() => jsonResponse(200, {})]).client.revoke(sentinelTokenBundle('tiktok'), sentinelCredentials('tiktok'));
    await rejectsWithReason(
      harness([() => jsonResponse(200, { unexpected: true })]).client.revoke(sentinelTokenBundle('tiktok'), sentinelCredentials('tiktok')),
      'exchange-failed',
    );
  });
});

describe('TiktokPlatformClient: identity', () => {
  it('labels the account with its display name, the token in the header only', async () => {
    const { client, fake } = harness([() => ok({ user: { open_id: 'open-id-1', display_name: 'Studio Owner' } })]);
    const identity = await client.fetchIdentity(sentinelTokenBundle('tiktok'));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    assert.deepEqual(identity, { accountLabel: 'Studio Owner', platformAccountId: 'open-id-1' });
    assert.equal(fake.requests[0]?.headers.get('authorization'), `Bearer ${SENTINEL_ACCESS_TOKEN}`);
    assert.equal(fake.requests[0]?.url.searchParams.get('fields'), 'open_id,display_name');
  });

  it('maps API error codes before the HTTP status, and a redirect to invalid-response', async () => {
    const tokens = sentinelTokenBundle('tiktok');
    await rejectsWithReason(harness([() => apiError(401, 'access_token_invalid')]).client.fetchIdentity(tokens), 'token-revoked');
    await rejectsWithReason(harness([() => apiError(200, 'scope_not_authorized')]).client.fetchIdentity(tokens), 'scope-missing');
    await rejectsWithReason(harness([() => emptyResponse(302, { location: 'https://evil.example/' })]).client.fetchIdentity(tokens), 'invalid-response');
    const dropped = await rejectsWithReason(harness([transportFailure()]).client.fetchIdentity(tokens), 'network');
    assert.equal(dropped.details.transport, true);
  });
});

describe('TiktokPlatformClient: chunk plan', () => {
  it('sends a file up to 64 MB whole and splits a larger one into 16 MiB chunks', () => {
    assert.deepEqual(planChunks(64_000_000), { videoSize: 64_000_000, chunkSize: 64_000_000, totalChunkCount: 1 });
    const plan = planChunks(64_000_001);
    assert.equal(plan.chunkSize, 16 * 1024 * 1024);
    assert.equal(plan.totalChunkCount, 3);
    const ranges = chunkRanges(plan);
    assert.equal(ranges.at(-1)?.last, 64_000_000);
    assert.equal(ranges.at(-1)?.isFinal, true);
    assert.equal(
      ranges.reduce((sum, range) => sum + range.length, 0),
      64_000_001,
    );
  });

  it('refuses an empty file and one over the 4 GiB bound', () => {
    assert.throws(() => planChunks(0), { reason: 'media-rejected' });
    assert.throws(() => planChunks(4_294_967_297), { reason: 'media-rejected' });
  });
});

describe('TiktokPlatformClient: inbox upload', () => {
  let video: VideoFile | null = null;

  afterEach(async () => {
    await video?.close();
    video = null;
  });

  function uploadRequest(file: VideoFile, progress: number[] = [], overrides: Partial<UploadRequest> = {}): UploadRequest {
    return {
      attemptId: ATTEMPT_ID,
      file: file.handle,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      metadata: { title: 'Owner title', caption: 'Owner caption', tags: ['tag'], visibility: 'public', aiDisclosure: true },
      tokens: sentinelTokenBundle('tiktok'),
      now: NOW,
      onProgress: (bytes) => progress.push(bytes),
      ...overrides,
    };
  }

  const initOk = (): Response => ok({ publish_id: PUBLISH_ID, upload_url: UPLOAD_URL });

  it('inits a FILE_UPLOAD with the video only, then sends the bytes to the returned host', async () => {
    video = await createVideoFile(videoBytes(2048));
    const progress: number[] = [];
    const { client, fake } = harness([initOk, () => emptyResponse(201)]);
    const outcome = await client.upload(uploadRequest(video, progress));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    assert.deepEqual(outcome, { state: 'processing', uploadRef: PUBLISH_ID });
    const [init, put] = fake.requests;
    assert.equal(init?.url.href, 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
    assert.deepEqual(jsonOf(init), { source_info: { source: 'FILE_UPLOAD', video_size: 2048, chunk_size: 2048, total_chunk_count: 1 } });
    assert.ok(typeof init?.body === 'string' && !init.body.includes('Owner title') && !init.body.includes('Owner caption'));
    assert.equal(put?.url.href, UPLOAD_URL);
    assert.equal(put?.method, 'PUT');
    assert.equal(put?.headers.get('content-range'), 'bytes 0-2047/2048');
    assert.equal(put?.headers.get('authorization'), null, 'the upload host never receives the access token');
    assert.deepEqual(progress, [2048]);
  });

  it('sends no byte to an upload host outside the allowlist', async () => {
    video = await createVideoFile(videoBytes(2048));
    for (const uploadUrl of ['https://upload.evil.example/x', 'http://open-upload.tiktokapis.com/x', 'https://open-upload.tiktokapis.com:8443/x']) {
      const { client, fake } = harness([() => ok({ publish_id: PUBLISH_ID, upload_url: uploadUrl })]);
      await rejectsWithReason(client.upload(uploadRequest(video)), 'platform-unavailable');
      fake.assertFinished();
    }
  });

  it('never sends the last chunk of a file whose hash differs from the re-check', async () => {
    video = await createVideoFile(videoBytes(2048));
    const { client, fake } = harness([initOk]);
    await rejectsWithReason(client.upload(uploadRequest(video, [], { sha256: 'b'.repeat(64) })), 'media-rejected');
    fake.assertFinished();
  });

  it('maps init refusals: the daily inbox cap, a 200 outside the schema and a 403', async () => {
    video = await createVideoFile(videoBytes(2048));
    const capped = await rejectsWithReason(
      harness([() => apiError(429, 'spam_risk_too_many_pending_share', { 'retry-after': '600' })]).client.upload(uploadRequest(video)),
      'quota-exhausted',
    );
    assert.equal(capped.details.retryAfterSeconds, 600);
    await rejectsWithReason(harness([() => ok({ publish_id: PUBLISH_ID })]).client.upload(uploadRequest(video)), 'platform-unavailable');
    await rejectsWithReason(harness([() => apiError(403, 'unknown_code')]).client.upload(uploadRequest(video)), 'policy-rejected');
  });

  it('asks the status once when the last chunk gets a 5xx, since the draft may exist', async () => {
    video = await createVideoFile(videoBytes(2048));
    const { client, fake } = harness([initOk, () => emptyResponse(502), () => statusAnswer('SEND_TO_USER_INBOX')]);
    assert.deepEqual(await client.upload(uploadRequest(video)), { state: 'sent-to-inbox', uploadRef: PUBLISH_ID });
    fake.assertFinished();
    assert.deepEqual(jsonOf(fake.requests[2]), { publish_id: PUBLISH_ID });
  });

  it('resumes the same chunk after the B9 waits, then reads a still-uploading status as outcome-unknown', async () => {
    video = await createVideoFile(videoBytes(2048));
    const { client, fake, waits } = harness([
      initOk,
      transportFailure(),
      transportFailure(),
      transportFailure(),
      transportFailure(),
      () => statusAnswer('PROCESSING_UPLOAD'),
    ]);
    await rejectsWithReason(client.upload(uploadRequest(video)), 'outcome-unknown');
    fake.assertFinished();
    assert.deepEqual(waits, [5_000, 15_000, 45_000]);
    assert.equal(fake.requests.filter((request) => request.method === 'PUT').length, 4);
  });

  it('reads a refusal of a resent last chunk as outcome-unknown, and a first refusal as media-rejected', async () => {
    video = await createVideoFile(videoBytes(2048));
    await rejectsWithReason(harness([initOk, transportFailure(), () => emptyResponse(400)]).client.upload(uploadRequest(video)), 'outcome-unknown');
    await rejectsWithReason(harness([initOk, () => emptyResponse(400)]).client.upload(uploadRequest(video)), 'media-rejected');
  });
});

describe('TiktokPlatformClient: upload status', () => {
  const statusRequest = (uploadRef = PUBLISH_ID): Parameters<TiktokPlatformClient['uploadStatus']>[0] => ({
    attemptId: ATTEMPT_ID,
    uploadRef,
    tokens: sentinelTokenBundle('tiktok'),
    now: NOW,
  });

  it('keeps every digit of a 19-digit post id and reads its link from share_url', async () => {
    const { client, fake } = harness([
      () => statusAnswer('PUBLISH_COMPLETE', `,"publicaly_available_post_id":[${POST_ID}]`),
      () => ok({ videos: [{ id: POST_ID, share_url: `https://www.tiktok.com/@studio.owner/video/${POST_ID}?is_from_webapp=1` }] }),
    ]);
    const status = await client.uploadStatus(statusRequest());
    fake.assertFinished();
    assert.deepEqual(status, {
      state: 'published',
      platformVideoId: POST_ID,
      platformMediaId: null,
      publishedAt: NOW.toISOString(),
      publicationUrl: `https://www.tiktok.com/@studio.owner/video/${POST_ID}`,
    });
    assert.deepEqual(jsonOf(fake.requests[1]), { filters: { video_ids: [POST_ID] } });
  });

  it('keeps a published post published when the link query fails or names another video', async () => {
    const failing = harness([() => statusAnswer('PUBLISH_COMPLETE', `,"publicly_available_post_id":[${POST_ID}]`), () => apiError(403, 'scope_not_authorized')]);
    assert.deepEqual(await failing.client.uploadStatus(statusRequest()), {
      state: 'published',
      platformVideoId: POST_ID,
      platformMediaId: null,
      publishedAt: NOW.toISOString(),
      publicationUrl: null,
    });
    const mismatched = harness([
      () => statusAnswer('PUBLISH_COMPLETE', `,"publicaly_available_post_id":[${POST_ID}]`),
      () => ok({ videos: [{ id: POST_ID, share_url: 'https://www.tiktok.com/@someone/video/7000000000000000001' }] }),
    ]);
    const status = await mismatched.client.uploadStatus(statusRequest());
    assert.equal(status.state === 'published' ? status.publicationUrl : 'not published', null);
  });

  it('maps inbox, private and failed posts, and sends nothing for a malformed ref', async () => {
    assert.deepEqual(await harness([() => statusAnswer('SEND_TO_USER_INBOX')]).client.uploadStatus(statusRequest()), { state: 'sent-to-inbox' });
    assert.deepEqual(await harness([() => statusAnswer('PUBLISH_COMPLETE')]).client.uploadStatus(statusRequest()), { state: 'sent-to-inbox' });
    assert.deepEqual(await harness([() => statusAnswer('PROCESSING_DOWNLOAD')]).client.uploadStatus(statusRequest()), { state: 'processing' });
    assert.deepEqual(await harness([() => statusAnswer('FAILED', ',"fail_reason":"duration_check_failed"')]).client.uploadStatus(statusRequest()), {
      state: 'failed',
      reasonId: 'media-rejected',
    });
    assert.deepEqual(await harness([() => statusAnswer('FAILED', ',"fail_reason":"something_new"')]).client.uploadStatus(statusRequest()), {
      state: 'failed',
      reasonId: 'platform-unavailable',
    });
    await rejectsWithReason(harness([() => apiError(200, 'invalid_publish_id')]).client.uploadStatus(statusRequest()), 'outcome-unknown');
    const malformed = harness([]);
    await rejectsWithReason(malformed.client.uploadStatus(statusRequest('has space')), 'outcome-unknown');
    malformed.fake.assertFinished();
  });
});

describe('TiktokPlatformClient: metrics', () => {
  function metricsRequest(targets: MetricsRequest['targets'], signal: AbortSignal = new AbortController().signal): MetricsRequest {
    return { targets, tokens: sentinelTokenBundle('tiktok'), now: NOW, signal };
  }

  it('queries at most 20 ids a call and maps the four counts of the section 5.5 table', async () => {
    const ids = Array.from({ length: 21 }, (_unused, index) => String(7_300_000_000_000_000_000n + BigInt(index)));
    const { client, fake } = harness([
      () => ok({ videos: [{ id: ids[0], view_count: 900, like_count: 40, comment_count: null, share_count: 3 }], has_more: false }),
      () => ok({ videos: [] }),
    ]);
    const targets = [...ids.map((id, index) => metricTarget(`pub-${index}`, id)), metricTarget('pub-bad', 'not-a-tiktok-id')];
    const results = await client.fetchMetrics(metricsRequest(targets));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    const firstBatch = jsonOf(fake.requests[0]);
    assert.deepEqual(firstBatch, { filters: { video_ids: ids.slice(0, 20) } });
    assert.deepEqual(jsonOf(fake.requests[1]), { filters: { video_ids: ids.slice(20) } });
    assert.equal(results.length, 22);
    assert.deepEqual(results[0], {
      publicationId: 'pub-0',
      status: 'ok',
      platformMediaId: null,
      metrics: {
        views: 900,
        likes: 40,
        comments: null,
        shares: 3,
        saves: null,
        impressions: null,
        reach: null,
        followersGained: null,
        watchTimeSeconds: null,
        averageViewDurationSeconds: null,
        averageViewPercent: null,
      },
    });
    assert.deepEqual(results[1], { publicationId: 'pub-1', status: 'not-found' });
    assert.deepEqual(results[21], { publicationId: 'pub-bad', status: 'not-found' });
  });

  it('ends the pass on the first refused call, and sends nothing once the budget is spent', async () => {
    const target = metricTarget('pub-1', POST_ID);
    const limited = await rejectsWithReason(
      harness([() => apiError(429, 'rate_limit_exceeded', { 'retry-after': '60' })]).client.fetchMetrics(metricsRequest([target])),
      'rate-limited',
    );
    assert.equal(limited.details.retryAfterSeconds, 60);
    const controller = new AbortController();
    controller.abort();
    const spent = harness([]);
    await rejectsWithReason(spent.client.fetchMetrics(metricsRequest([target], controller.signal)), 'network');
    spent.fake.assertFinished();
  });
});
