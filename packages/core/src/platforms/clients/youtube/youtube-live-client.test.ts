import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import { afterEach, describe, it } from 'node:test';
import { SecretToken } from '../../token-bundle';
import {
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_AUTHORIZATION_CODE,
  SENTINEL_CLIENT_ID,
  SENTINEL_CLIENT_SECRET,
  SENTINEL_REFRESH_TOKEN,
  sentinelTokenBundle,
  sentinelsIn,
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
import { YOUTUBE_UPLOAD_CHUNK_BYTES, youtubeScopes } from './youtube.constants';
import { YoutubeLiveClient } from './youtube-live-client';

/*
 * The live YouTube client against a scripted `fetch` (SPEC 0007 sections 5.1, 5.2, 5.4, 5.5, 5.7;
 * ticket R4-07). No request leaves the process and no B9 wait is real: `sleep` records its argument.
 */

const NOW = new Date('2026-11-20T10:00:00.000Z');
const REDIRECT = 'http://127.0.0.1:4310/connections/youtube/callback';
const VIDEO_ID = 'dQw4w9WgXcQ';
const SESSION_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session-a';
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const VERIFIER = 'pkce-verifier-for-tests-only-not-a-secret-value-qqqq';

interface Harness {
  fake: ScriptedFetch;
  client: YoutubeLiveClient;
  sleeps: number[];
}

function harness(steps: readonly ScriptStep[]): Harness {
  const fake = new ScriptedFetch(steps);
  const sleeps: number[] = [];
  const client = new YoutubeLiveClient({
    fetch: fake.fetch,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });
  return { fake, client, sleeps };
}

function tokenAnswer(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(200, {
    access_token: 'new-access-token-value',
    expires_in: 3599,
    token_type: 'Bearer',
    scope: `${youtubeScopes.readonly} ${youtubeScopes.upload} https://www.googleapis.com/auth/unrelated`,
    refresh_token: 'new-refresh-token-value',
    ...overrides,
  });
}

function videoState(uploadStatus: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: VIDEO_ID, snippet: { publishedAt: '2026-11-20T09:59:00.000Z' }, status: { uploadStatus, ...extra } };
}

describe('YoutubeLiveClient: connect, scopes and links', () => {
  it('asks for identity plus the scopes of the enabled capabilities, once each', () => {
    const { client } = harness([]);
    assert.deepEqual(client.scopesFor([]), [youtubeScopes.readonly]);
    assert.deepEqual(client.scopesFor(['metrics', 'publish']), [youtubeScopes.readonly, youtubeScopes.analyticsReadonly, youtubeScopes.upload]);
  });

  it('builds the canonical watch URL only for a YouTube video id', () => {
    const { client } = harness([]);
    assert.equal(client.publicationUrl({ platformVideoId: VIDEO_ID, accountLabel: 'Channel' }), `https://www.youtube.com/watch?v=${VIDEO_ID}`);
    assert.equal(client.publicationUrl({ platformVideoId: 'not/a-video-id', accountLabel: 'Channel' }), null);
  });

  it('puts only public parameters in the authorize URL, with PKCE S256 and offline access', () => {
    const { client, fake } = harness([]);
    const href = client.authorizeUrl({
      credentials: sentinelCredentials('youtube'),
      redirectUri: REDIRECT,
      state: 'state-value-1',
      challenge: 'challenge-value-1',
      scopes: [youtubeScopes.readonly],
    });
    const url = new URL(href);
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('client_id'), SENTINEL_CLIENT_ID);
    assert.equal(url.searchParams.get('state'), 'state-value-1');
    assert.equal(url.searchParams.get('code_challenge'), 'challenge-value-1');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.ok(!href.includes(SENTINEL_CLIENT_SECRET), 'the client secret never goes in the browser URL');
    assert.equal(fake.requests.length, 0);
  });

  it('refuses a redirect off the loopback callback, an unknown scope and a missing challenge', () => {
    const { client } = harness([]);
    const base = { credentials: sentinelCredentials('youtube'), redirectUri: REDIRECT, state: 's', challenge: 'c', scopes: [youtubeScopes.readonly] };
    assert.throws(() => client.authorizeUrl({ ...base, redirectUri: 'https://evil.example/callback' }), { reason: 'exchange-failed' });
    assert.throws(() => client.authorizeUrl({ ...base, redirectUri: `${REDIRECT}?x=1` }), { reason: 'exchange-failed' });
    assert.throws(() => client.authorizeUrl({ ...base, scopes: ['https://www.googleapis.com/auth/youtube'] }), { reason: 'scope-missing' });
    assert.throws(() => client.authorizeUrl({ ...base, challenge: null }), { reason: 'exchange-failed' });
    assert.throws(() => client.authorizeUrl({ ...base, credentials: null }), { reason: 'exchange-failed' });
  });
});

describe('YoutubeLiveClient: token endpoint', () => {
  it('exchanges the code in a POST body and keeps only the scopes it knows', async () => {
    const { client, fake } = harness([() => tokenAnswer({ refresh_token_expires_in: 604_800 })]);
    const bundle = await client.exchangeCode({
      code: new SecretToken(SENTINEL_AUTHORIZATION_CODE),
      verifier: new SecretToken(VERIFIER),
      redirectUri: REDIRECT,
      credentials: sentinelCredentials('youtube'),
      connectionId: '01JD2Q7F3M8V5K9X4T6R2N0C0N',
      now: NOW,
    });
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    const request = fake.requests[0];
    assert.equal(request?.method, 'POST');
    assert.equal(request?.url.href, 'https://oauth2.googleapis.com/token');
    assert.equal(request?.redirect, 'manual');
    const form = formOf(request);
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('code'), SENTINEL_AUTHORIZATION_CODE);
    assert.equal(form.get('code_verifier'), VERIFIER);
    assert.equal(form.get('client_secret'), SENTINEL_CLIENT_SECRET);
    assert.equal(bundle.platform, 'youtube');
    assert.equal(bundle.accessToken.revealForPlatformCall(), 'new-access-token-value');
    assert.equal(bundle.refreshToken?.revealForPlatformCall(), 'new-refresh-token-value');
    assert.equal(bundle.accessExpiresAt, '2026-11-20T10:59:59.000Z');
    assert.equal(bundle.refreshExpiresAt, '2026-11-27T10:00:00.000Z');
    assert.deepEqual(bundle.scopes, [youtubeScopes.readonly, youtubeScopes.upload]);
  });

  it('fails an exchange that returns no refresh token, and maps refused codes', async () => {
    const request = {
      code: new SecretToken(SENTINEL_AUTHORIZATION_CODE),
      verifier: new SecretToken(VERIFIER),
      redirectUri: REDIRECT,
      credentials: sentinelCredentials('youtube'),
      connectionId: '01JD2Q7F3M8V5K9X4T6R2N0C0N',
      now: NOW,
    };
    await rejectsWithReason(harness([() => tokenAnswer({ refresh_token: undefined })]).client.exchangeCode(request), 'exchange-failed');
    await rejectsWithReason(
      harness([() => jsonResponse(400, { error: 'invalid_grant', error_description: `bad ${SENTINEL_AUTHORIZATION_CODE}` })]).client.exchangeCode(request),
      'exchange-failed',
    );
    await rejectsWithReason(harness([() => jsonResponse(400, { error: 'access_denied' })]).client.exchangeCode(request), 'denied');
    await rejectsWithReason(harness([() => jsonResponse(503, {})]).client.exchangeCode(request), 'platform-unavailable');
    await rejectsWithReason(harness([() => tokenAnswer({ extra_field: true })]).client.exchangeCode(request), 'invalid-response');
  });

  it('keeps the refresh token when Google does not rotate it', async () => {
    const { client, fake } = harness([() => tokenAnswer({ refresh_token: undefined, scope: undefined })]);
    const tokens = sentinelTokenBundle('youtube', { scopes: [youtubeScopes.readonly], refreshExpiresAt: '2026-12-01T00:00:00.000Z' });
    const refreshed = await client.refresh(tokens, sentinelCredentials('youtube'), NOW);
    fake.assertFinished();
    assert.equal(formOf(fake.requests[0]).get('refresh_token'), SENTINEL_REFRESH_TOKEN);
    assert.equal(refreshed.refreshToken?.revealForPlatformCall(), SENTINEL_REFRESH_TOKEN);
    assert.equal(refreshed.refreshExpiresAt, '2026-12-01T00:00:00.000Z');
    assert.deepEqual(refreshed.scopes, [youtubeScopes.readonly]);
    assert.equal(refreshed.obtainedAt, NOW.toISOString());
  });

  it('reads invalid_grant on a refresh as expired only when the bundle said so', async () => {
    const credentials = sentinelCredentials('youtube');
    const expired = sentinelTokenBundle('youtube', { refreshExpiresAt: '2026-11-19T00:00:00.000Z' });
    const live = sentinelTokenBundle('youtube', { refreshExpiresAt: '2026-12-19T00:00:00.000Z' });
    await rejectsWithReason(harness([() => jsonResponse(400, { error: 'invalid_grant' })]).client.refresh(expired, credentials, NOW), 'refresh-expired');
    await rejectsWithReason(harness([() => jsonResponse(400, { error: 'invalid_grant' })]).client.refresh(live, credentials, NOW), 'token-revoked');
    await rejectsWithReason(harness([]).client.refresh(sentinelTokenBundle('youtube', { refreshToken: null }), credentials, NOW), 'refresh-expired');
    await rejectsWithReason(harness([]).client.refresh(live, null, NOW), 'token-revoked');
  });

  it('carries a Retry-After on a rate-limited refresh, capped at two days', async () => {
    const credentials = sentinelCredentials('youtube');
    const short = await rejectsWithReason(
      harness([() => jsonResponse(429, {}, { 'retry-after': '120' })]).client.refresh(sentinelTokenBundle('youtube'), credentials, NOW),
      'rate-limited',
    );
    assert.equal(short.details.retryAfterSeconds, 120);
    const capped = await rejectsWithReason(
      harness([() => jsonResponse(429, {}, { 'retry-after': '9999999' })]).client.refresh(sentinelTokenBundle('youtube'), credentials, NOW),
      'rate-limited',
    );
    assert.equal(capped.details.retryAfterSeconds, 172_800);
  });

  it('revokes the refresh token in a POST body and maps a refusal', async () => {
    const ok = harness([() => emptyResponse(200)]);
    await ok.client.revoke(sentinelTokenBundle('youtube'));
    ok.fake.assertFinished();
    ok.fake.assertNoSentinelInUrls();
    assert.equal(ok.fake.requests[0]?.url.href, 'https://oauth2.googleapis.com/revoke');
    assert.equal(formOf(ok.fake.requests[0]).get('token'), SENTINEL_REFRESH_TOKEN);
    await rejectsWithReason(harness([() => jsonResponse(400, { error: 'invalid_token' })]).client.revoke(sentinelTokenBundle('youtube')), 'token-revoked');
    await rejectsWithReason(harness([() => emptyResponse(503)]).client.revoke(sentinelTokenBundle('youtube')), 'platform-unavailable');
    await rejectsWithReason(harness([() => emptyResponse(429)]).client.revoke(sentinelTokenBundle('youtube')), 'rate-limited');
  });
});

describe('YoutubeLiveClient: identity and upload status', () => {
  it('reads the channel with the token in the Authorization header only', async () => {
    const { client, fake } = harness([() => jsonResponse(200, { items: [{ id: 'UC_channel-1', snippet: { title: 'My Channel' } }] })]);
    const identity = await client.fetchIdentity(sentinelTokenBundle('youtube'));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    assert.deepEqual(identity, { accountLabel: 'My Channel', platformAccountId: 'UC_channel-1' });
    assert.equal(fake.requests[0]?.headers.get('authorization'), `Bearer ${SENTINEL_ACCESS_TOKEN}`);
    assert.equal(fake.requests[0]?.url.searchParams.get('mine'), 'true');
  });

  it('refuses an account with no channel, an answer outside the schema and a revoked token', async () => {
    const tokens = sentinelTokenBundle('youtube');
    await rejectsWithReason(harness([() => jsonResponse(200, {})]).client.fetchIdentity(tokens), 'account-not-eligible');
    await rejectsWithReason(
      harness([() => jsonResponse(200, { items: [{ id: 'UC1', snippet: { title: 'x', description: 'extra' } }] })]).client.fetchIdentity(tokens),
      'invalid-response',
    );
    await rejectsWithReason(harness([() => jsonResponse(401, { error: { code: 401, message: 'nope' } })]).client.fetchIdentity(tokens), 'token-revoked');
  });

  it('maps every processing state of an uploaded video', async () => {
    const tokens = sentinelTokenBundle('youtube');
    const status = (state: Record<string, unknown>): Promise<unknown> =>
      harness([() => jsonResponse(200, { items: [state] })]).client.uploadStatus({ attemptId: ATTEMPT_ID, uploadRef: VIDEO_ID, tokens, now: NOW });
    assert.deepEqual(await status(videoState('uploaded')), { state: 'processing' });
    assert.deepEqual(await status(videoState('processed')), {
      state: 'published',
      platformVideoId: VIDEO_ID,
      platformMediaId: null,
      publishedAt: '2026-11-20T09:59:00.000Z',
    });
    assert.deepEqual(await status(videoState('failed', { failureReason: 'codec' })), { state: 'failed', reasonId: 'media-rejected' });
    assert.deepEqual(await status(videoState('rejected', { rejectionReason: 'length' })), { state: 'failed', reasonId: 'media-rejected' });
    assert.deepEqual(await status(videoState('rejected', { rejectionReason: 'copyright' })), { state: 'failed', reasonId: 'policy-rejected' });
  });

  it('never guesses a video that is not listed, and sends no request for a malformed ref', async () => {
    const tokens = sentinelTokenBundle('youtube');
    await rejectsWithReason(
      harness([() => jsonResponse(200, {})]).client.uploadStatus({ attemptId: ATTEMPT_ID, uploadRef: VIDEO_ID, tokens, now: NOW }),
      'outcome-unknown',
    );
    const malformed = harness([]);
    await rejectsWithReason(malformed.client.uploadStatus({ attemptId: ATTEMPT_ID, uploadRef: '../../etc', tokens, now: NOW }), 'invalid-response');
    malformed.fake.assertFinished();
  });
});

describe('YoutubeLiveClient: metrics', () => {
  function metricsRequest(targets: MetricsRequest['targets'], signal: AbortSignal = new AbortController().signal): MetricsRequest {
    return { targets, tokens: sentinelTokenBundle('youtube'), now: NOW, signal };
  }

  const report = (row: number[]): Response =>
    jsonResponse(200, {
      kind: 'youtubeAnalytics#resultTable',
      columnHeaders: ['shares', 'subscribersGained', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage'].map((name) => ({
        name,
        columnType: 'METRIC',
        dataType: 'INTEGER',
      })),
      rows: [row],
    });

  it('maps statistics and lifetime analytics by the section 5.5 table', async () => {
    const { client, fake } = harness([
      () => jsonResponse(200, { items: [{ id: VIDEO_ID, statistics: { viewCount: '1200', likeCount: '80', commentCount: '7' } }] }),
      () => report([4, 3, 12.5, 41.2, 63.1]),
    ]);
    const results = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', VIDEO_ID), metricTarget('pub-2', 'bad id')]));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    assert.deepEqual(results, [
      {
        publicationId: 'pub-1',
        status: 'ok',
        platformMediaId: null,
        metrics: {
          views: 1200,
          likes: 80,
          comments: 7,
          shares: 4,
          saves: null,
          impressions: null,
          reach: null,
          followersGained: 3,
          watchTimeSeconds: 750,
          averageViewDurationSeconds: 41.2,
          averageViewPercent: 63.1,
        },
      },
      { publicationId: 'pub-2', status: 'not-found' },
    ]);
    const analytics = fake.requests[1]?.url;
    assert.equal(analytics?.hostname, 'youtubeanalytics.googleapis.com');
    assert.equal(analytics?.searchParams.get('filters'), `video==${VIDEO_ID}`);
    assert.equal(analytics?.searchParams.get('ids'), 'channel==MINE');
  });

  it('reads a video missing from statistics as not found, and a plain forbidden as not owned', async () => {
    const other = 'abcdefghijk';
    const { client, fake } = harness([
      () => jsonResponse(200, { items: [{ id: other, statistics: { viewCount: '5' } }] }),
      () => jsonResponse(403, { error: { code: 403, errors: [{ reason: 'forbidden' }] } }),
    ]);
    const results = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', VIDEO_ID), metricTarget('pub-2', other)]));
    fake.assertFinished();
    assert.deepEqual(results, [
      { publicationId: 'pub-1', status: 'not-found' },
      { publicationId: 'pub-2', status: 'not-owned' },
    ]);
  });

  it('ends the pass on a quota answer, and sends nothing once the budget is spent', async () => {
    await rejectsWithReason(
      harness([
        () => jsonResponse(200, { items: [{ id: VIDEO_ID, statistics: { viewCount: '5' } }] }),
        () => jsonResponse(403, { error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }),
      ]).client.fetchMetrics(metricsRequest([metricTarget('pub-1', VIDEO_ID)])),
      'quota-exhausted',
    );
    const controller = new AbortController();
    controller.abort();
    const spent = harness([]);
    await rejectsWithReason(spent.client.fetchMetrics(metricsRequest([metricTarget('pub-1', VIDEO_ID)], controller.signal)), 'network');
    spent.fake.assertFinished();
  });
});

describe('YoutubeLiveClient: the network door', () => {
  it('follows no redirect and refuses an oversized body', async () => {
    const tokens = sentinelTokenBundle('youtube');
    await rejectsWithReason(harness([() => emptyResponse(302, { location: 'https://evil.example/' })]).client.fetchIdentity(tokens), 'invalid-response');
    await rejectsWithReason(harness([() => textResponse(200, 'x'.repeat(262_145))]).client.fetchIdentity(tokens), 'invalid-response');
  });

  it('reports a dropped connection as a transport failure without the platform text', async () => {
    const error = await rejectsWithReason(harness([transportFailure()]).client.fetchIdentity(sentinelTokenBundle('youtube')), 'network');
    assert.equal(error.details.transport, true);
  });
});

describe('YoutubeLiveClient: resumable upload', () => {
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
      metadata: { title: 'Tour title', caption: 'A caption', tags: ['tour', 'city'], visibility: 'unlisted', aiDisclosure: true },
      tokens: sentinelTokenBundle('youtube'),
      now: NOW,
      onProgress: (bytes) => progress.push(bytes),
      ...overrides,
    };
  }

  const sessionStarted = (): Response => emptyResponse(200, { location: SESSION_URL });

  it('opens one session with the owner metadata and sends a small file in one chunk', async () => {
    video = await createVideoFile(videoBytes(1000));
    const progress: number[] = [];
    const { client, fake } = harness([sessionStarted, () => jsonResponse(200, videoState('processed'))]);
    const outcome = await client.upload(uploadRequest(video, progress));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    assert.deepEqual(outcome, { state: 'published', platformVideoId: VIDEO_ID, platformMediaId: null, publishedAt: '2026-11-20T09:59:00.000Z' });
    const [start, put] = fake.requests;
    assert.equal(start?.method, 'POST');
    assert.equal(start?.url.searchParams.get('uploadType'), 'resumable');
    assert.equal(start?.headers.get('x-upload-content-length'), '1000');
    assert.deepEqual(jsonOf(start), {
      snippet: { title: 'Tour title', description: 'A caption', tags: ['tour', 'city'] },
      status: { privacyStatus: 'unlisted', containsSyntheticMedia: true, selfDeclaredMadeForKids: false },
      paidProductPlacementDetails: { hasPaidProductPlacement: false },
    });
    assert.equal(put?.method, 'PUT');
    assert.equal(put?.url.href, SESSION_URL);
    assert.equal(put?.headers.get('content-range'), 'bytes 0-999/1000');
    assert.equal(put?.body?.length, 1000);
    assert.deepEqual(progress, [1000]);
  });

  it('sends a two-chunk file in order and reports a processing video for the follow-up', async () => {
    const size = YOUTUBE_UPLOAD_CHUNK_BYTES + 10;
    video = await createVideoFile(videoBytes(size));
    const progress: number[] = [];
    const { client, fake } = harness([
      sessionStarted,
      () => emptyResponse(308, { range: `bytes=0-${YOUTUBE_UPLOAD_CHUNK_BYTES - 1}` }),
      () => jsonResponse(201, videoState('uploaded')),
    ]);
    const outcome = await client.upload(uploadRequest(video, progress));
    fake.assertFinished();
    assert.deepEqual(outcome, { state: 'processing', uploadRef: VIDEO_ID });
    assert.equal(fake.requests[1]?.headers.get('content-range'), `bytes 0-${YOUTUBE_UPLOAD_CHUNK_BYTES - 1}/${size}`);
    assert.equal(fake.requests[2]?.headers.get('content-range'), `bytes ${YOUTUBE_UPLOAD_CHUNK_BYTES}-${size - 1}/${size}`);
    assert.deepEqual(progress, [YOUTUBE_UPLOAD_CHUNK_BYTES, size]);
  });

  it('resumes after a 503 by asking for the received range, then re-sends only what is missing', async () => {
    const size = YOUTUBE_UPLOAD_CHUNK_BYTES + 10;
    const half = YOUTUBE_UPLOAD_CHUNK_BYTES / 2;
    video = await createVideoFile(videoBytes(size));
    const { client, fake, sleeps } = harness([
      sessionStarted,
      () => emptyResponse(503),
      () => emptyResponse(308, { range: `bytes=0-${half - 1}` }),
      () => jsonResponse(200, videoState('uploaded')),
    ]);
    const outcome = await client.upload(uploadRequest(video));
    fake.assertFinished();
    assert.deepEqual(outcome, { state: 'processing', uploadRef: VIDEO_ID });
    assert.deepEqual(sleeps, [5_000]);
    assert.equal(fake.requests[2]?.headers.get('content-range'), `bytes */${size}`);
    assert.equal(fake.requests[3]?.headers.get('content-range'), `bytes ${half}-${size - 1}/${size}`);
  });

  it('refuses to re-send bytes that changed on disk between the first send and the resume', async () => {
    const size = YOUTUBE_UPLOAD_CHUNK_BYTES + 10;
    const bytes = videoBytes(size);
    video = await createVideoFile(bytes);
    const path = video.path;
    const { client, fake } = harness([
      sessionStarted,
      async () => {
        // The file changes after the first chunk left: the resume re-reads the first half.
        const writer = await open(path, 'r+');
        await writer.write(Buffer.from([(bytes[100] ?? 0) ^ 0xff]), 0, 1, 100);
        await writer.close();
        return emptyResponse(503);
      },
      () => emptyResponse(308, { range: `bytes=0-${YOUTUBE_UPLOAD_CHUNK_BYTES / 2 - 1}` }),
    ]);
    await rejectsWithReason(client.upload(uploadRequest(video)), 'media-rejected');
    fake.assertFinished();
  });

  it('never sends the last byte of a file whose hash differs from the re-check', async () => {
    video = await createVideoFile(videoBytes(1000));
    const { client, fake } = harness([sessionStarted]);
    await rejectsWithReason(client.upload(uploadRequest(video, [], { sha256: 'a'.repeat(64) })), 'media-rejected');
    fake.assertFinished();
  });

  it('reads an exhausted resume budget after the last byte as outcome-unknown, after the three B9 waits', async () => {
    video = await createVideoFile(videoBytes(1000));
    const { client, fake, sleeps } = harness([sessionStarted, transportFailure(), transportFailure(), transportFailure(), transportFailure()]);
    await rejectsWithReason(client.upload(uploadRequest(video)), 'outcome-unknown');
    fake.assertFinished();
    assert.deepEqual(sleeps, [5_000, 15_000, 45_000]);
  });

  it('fails cleanly when the session URI points elsewhere or the session expires before the last byte', async () => {
    video = await createVideoFile(videoBytes(1000));
    const foreign = harness([() => emptyResponse(200, { location: 'https://evil.example/upload/youtube/v3/videos' })]);
    await rejectsWithReason(foreign.client.upload(uploadRequest(video)), 'platform-unavailable');
    foreign.fake.assertFinished();

    await video.close();
    video = await createVideoFile(videoBytes(YOUTUBE_UPLOAD_CHUNK_BYTES + 10));
    const expired = harness([sessionStarted, () => emptyResponse(404)]);
    await rejectsWithReason(expired.client.upload(uploadRequest(video)), 'platform-unavailable');
    expired.fake.assertFinished();
  });

  it('fails a rate-limited or quota answer at once and rejects an empty file before any request', async () => {
    video = await createVideoFile(videoBytes(1000));
    const limited = await rejectsWithReason(
      harness([() => jsonResponse(429, {}, { 'retry-after': '30' })]).client.upload(uploadRequest(video)),
      'rate-limited',
    );
    assert.equal(limited.details.retryAfterSeconds, 30);
    await rejectsWithReason(
      harness([() => jsonResponse(403, { error: { code: 403, errors: [{ reason: 'uploadLimitExceeded' }] } })]).client.upload(uploadRequest(video)),
      'quota-exhausted',
    );
    const empty = harness([]);
    await rejectsWithReason(empty.client.upload(uploadRequest(video, [], { sizeBytes: 0 })), 'media-rejected');
    empty.fake.assertFinished();
  });

  it('reads an unreadable final answer as outcome-unknown, never as a clean failure', async () => {
    video = await createVideoFile(videoBytes(1000));
    const { client } = harness([sessionStarted, () => textResponse(200, '<html>oops</html>')]);
    const error = await rejectsWithReason(client.upload(uploadRequest(video)), 'outcome-unknown');
    assert.deepEqual(sentinelsIn(error.message), []);
  });
});
