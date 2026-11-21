import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SecretToken } from '../../token-bundle';
import {
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_AUTHORIZATION_CODE,
  SENTINEL_CLIENT_ID,
  SENTINEL_CLIENT_SECRET,
  sentinelTokenBundle,
} from '../../token-fixtures.harness.test';
import {
  ScriptedFetch,
  emptyResponse,
  formOf,
  jsonResponse,
  metricTarget,
  rejectsWithReason,
  sentinelCredentials,
  textResponse,
  transportFailure,
  type ScriptStep,
} from '../live-client.harness.test';
import { type MetricsRequest } from '../platform-client.port';
import { InstagramLiveClient } from './instagram-live-client';

/*
 * The live Instagram client against a scripted `fetch` (SPEC 0007 sections 5.1, 5.2, 5.5 and 5.7;
 * ticket R4-08; OD8): Instagram Login without PKCE, the two-step long-lived exchange, re-extension,
 * identity and media insights. Publishing is refused locally. No request leaves the process.
 */

const NOW = new Date('2026-11-20T10:00:00.000Z');
const REDIRECT = 'http://127.0.0.1:4310/connections/instagram/callback';
const SHORTCODE = 'DAbCdEf1234';
const OTHER_SHORTCODE = 'DZyXwVu9876';
const MEDIA_ID = '17900000000000001';
const OTHER_MEDIA_ID = '17900000000000002';
const SHORT_LIVED_TOKEN = 'short-lived-token-value';
const LONG_LIVED_TOKEN = 'long-lived-token-value';
const REEL_METRICS = 'views,likes,comments,shares,saved,reach,ig_reels_avg_watch_time,ig_reels_video_view_total_time';
const BASE_METRICS = 'views,likes,comments,shares,saved,reach';

interface Harness {
  fake: ScriptedFetch;
  client: InstagramLiveClient;
}

function harness(steps: readonly ScriptStep[]): Harness {
  const fake = new ScriptedFetch(steps);
  return { fake, client: new InstagramLiveClient({ fetch: fake.fetch }) };
}

function graphError(status: number, code: number, subcode?: number, headers: Record<string, string> = {}): Response {
  const error: Record<string, unknown> = { message: 'platform text that must be dropped', type: 'OAuthException', code, fbtrace_id: 'trace' };
  if (subcode !== undefined) error.error_subcode = subcode;
  return jsonResponse(status, { error }, headers);
}

function longLived(token = LONG_LIVED_TOKEN, expiresIn = 5_184_000): Response {
  return jsonResponse(200, { access_token: token, token_type: 'bearer', expires_in: expiresIn });
}

function insight(name: string, value: number): Record<string, unknown> {
  return { name, period: 'lifetime', values: [{ value }], title: name, id: `${MEDIA_ID}/insights/${name}/lifetime` };
}

function mediaPage(items: readonly Record<string, unknown>[], after?: string): Response {
  const paging = after === undefined ? { cursors: { before: 'QVFIUmJlZA' } } : { cursors: { before: 'QVFIUmJlZA', after }, next: `https://graph.instagram.com/v27.0/me/media?access_token=x&after=${after}` };
  return jsonResponse(200, { data: items, paging });
}

describe('InstagramLiveClient: connect, scopes and links', () => {
  it('uses no PKCE and asks only the basic and insights scopes, never a publish scope', () => {
    const { client } = harness([]);
    assert.equal(client.pkce, 'none');
    assert.deepEqual(client.scopesFor(['metrics', 'publish']), ['instagram_business_basic', 'instagram_business_manage_insights']);
    assert.deepEqual(client.scopesFor(['publish']), ['instagram_business_basic']);
  });

  it('builds the canonical reel URL for a shortcode and nothing for another value', () => {
    const { client } = harness([]);
    assert.equal(client.publicationUrl({ platformVideoId: SHORTCODE, accountLabel: '@studio' }), `https://www.instagram.com/reel/${SHORTCODE}/`);
    assert.equal(client.publicationUrl({ platformVideoId: 'a/b', accountLabel: '@studio' }), null);
  });

  it('puts the app id, state and comma-joined scopes in the authorize URL, never the secret', () => {
    const href = harness([]).client.authorizeUrl({
      credentials: sentinelCredentials('instagram'),
      redirectUri: REDIRECT,
      state: 'state-value-1',
      challenge: null,
      scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
    });
    const url = new URL(href);
    assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), SENTINEL_CLIENT_ID);
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_insights');
    assert.equal(url.searchParams.get('state'), 'state-value-1');
    assert.ok(!href.includes(SENTINEL_CLIENT_SECRET));
  });

  it('refuses an authorize URL without credentials', () => {
    assert.throws(
      () => harness([]).client.authorizeUrl({ credentials: null, redirectUri: REDIRECT, state: 's', challenge: null, scopes: ['instagram_business_basic'] }),
      { reason: 'exchange-failed' },
    );
  });
});

describe('InstagramLiveClient: code exchange', () => {
  const exchange = (code = SENTINEL_AUTHORIZATION_CODE): Parameters<InstagramLiveClient['exchangeCode']>[0] => ({
    code: new SecretToken(code),
    // The port always carries a verifier; Instagram Login has no PKCE, so it is never sent.
    verifier: new SecretToken('unused-pkce-verifier-for-instagram-tests'),
    redirectUri: REDIRECT,
    credentials: sentinelCredentials('instagram'),
    connectionId: '01JD2Q7F3M8V5K9X4T6R2N0C0N',
    now: NOW,
  });

  it('strips the #_ suffix, then trades the short-lived token for the long-lived one in a form body', async () => {
    const { client, fake } = harness([
      () =>
        jsonResponse(200, {
          data: [{ access_token: SHORT_LIVED_TOKEN, user_id: 17841400000000000, permissions: 'instagram_business_basic,instagram_business_manage_insights,unknown_scope' }],
        }),
      () => longLived(),
    ]);
    const bundle = await client.exchangeCode(exchange(`${SENTINEL_AUTHORIZATION_CODE}#_`));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    const [codeCall, longCall] = fake.requests;
    assert.equal(codeCall?.url.href, 'https://api.instagram.com/oauth/access_token');
    assert.equal(codeCall?.method, 'POST');
    const codeForm = formOf(codeCall);
    assert.equal(codeForm.get('code'), SENTINEL_AUTHORIZATION_CODE);
    assert.equal(codeForm.get('client_id'), SENTINEL_CLIENT_ID);
    assert.equal(codeForm.get('client_secret'), SENTINEL_CLIENT_SECRET);
    assert.equal(codeForm.get('grant_type'), 'authorization_code');
    assert.equal(codeForm.get('redirect_uri'), REDIRECT);
    assert.equal(longCall?.url.href, 'https://graph.instagram.com/access_token');
    assert.equal(longCall?.method, 'POST');
    const longForm = formOf(longCall);
    assert.equal(longForm.get('grant_type'), 'ig_exchange_token');
    assert.equal(longForm.get('client_secret'), SENTINEL_CLIENT_SECRET);
    assert.equal(longForm.get('access_token'), SHORT_LIVED_TOKEN);
    assert.equal(bundle.accessToken.revealForPlatformCall(), LONG_LIVED_TOKEN);
    assert.equal(bundle.accessExpiresAt, '2027-01-19T10:00:00.000Z');
    assert.equal(bundle.refreshToken, null);
    assert.equal(bundle.refreshExpiresAt, null);
    assert.deepEqual(bundle.scopes, ['instagram_business_basic', 'instagram_business_manage_insights']);
  });

  it('accepts the flat answer with permissions as an array', async () => {
    const { client } = harness([
      () => jsonResponse(200, { access_token: SHORT_LIVED_TOKEN, user_id: '17841400000000000', permissions: ['instagram_business_basic'] }),
      () => longLived(),
    ]);
    assert.deepEqual((await client.exchangeCode(exchange())).scopes, ['instagram_business_basic']);
  });

  it('reads any refusal of either step as exchange-failed, except rate and quota limits', async () => {
    await rejectsWithReason(
      harness([() => jsonResponse(400, { error_type: 'OAuthException', code: 400, error_message: 'Invalid code' })]).client.exchangeCode(exchange()),
      'exchange-failed',
    );
    await rejectsWithReason(
      harness([() => jsonResponse(200, { access_token: SHORT_LIVED_TOKEN, user_id: '1', permissions: '' }), () => graphError(400, 190)]).client.exchangeCode(exchange()),
      'exchange-failed',
    );
    await rejectsWithReason(harness([() => graphError(400, 4)]).client.exchangeCode(exchange()), 'rate-limited');
    await rejectsWithReason(harness([() => graphError(400, 80002)]).client.exchangeCode(exchange()), 'quota-exhausted');
    await rejectsWithReason(
      harness([() => jsonResponse(200, { access_token: SHORT_LIVED_TOKEN, user_id: '1', permissions: '', extra: true })]).client.exchangeCode(exchange()),
      'invalid-response',
    );
  });

  it('refuses an exchange without credentials before any request', async () => {
    const { client, fake } = harness([]);
    await rejectsWithReason(client.exchangeCode({ ...exchange(), credentials: null }), 'exchange-failed');
    fake.assertFinished();
  });
});

describe('InstagramLiveClient: refresh and revoke', () => {
  it('re-extends the token with a GET that carries it in the header, not the query', async () => {
    const { client, fake } = harness([() => longLived('re-extended-token-value', 5_184_000)]);
    const refreshed = await client.refresh(sentinelTokenBundle('instagram', { refreshToken: null }), null, NOW);
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    const [request] = fake.requests;
    assert.equal(request?.method, 'GET');
    assert.equal(request?.url.origin + (request?.url.pathname ?? ''), 'https://graph.instagram.com/refresh_access_token');
    assert.equal(request?.url.searchParams.get('grant_type'), 'ig_refresh_token');
    assert.equal(request?.headers.get('authorization'), `Bearer ${SENTINEL_ACCESS_TOKEN}`);
    assert.equal(request?.redirect, 'manual');
    assert.equal(refreshed.accessToken.revealForPlatformCall(), 're-extended-token-value');
    assert.equal(refreshed.accessExpiresAt, '2027-01-19T10:00:00.000Z');
    assert.equal(refreshed.refreshToken, null);
    assert.equal(refreshed.obtainedAt, NOW.toISOString());
  });

  it('maps refresh refusals: expired, revoked, unavailable and the unknown fallback', async () => {
    const tokens = sentinelTokenBundle('instagram');
    await rejectsWithReason(harness([() => graphError(400, 190, 463)]).client.refresh(tokens, null, NOW), 'refresh-expired');
    await rejectsWithReason(harness([() => graphError(400, 190, 460)]).client.refresh(tokens, null, NOW), 'token-revoked');
    await rejectsWithReason(harness([() => graphError(500, 2)]).client.refresh(tokens, null, NOW), 'platform-unavailable');
    await rejectsWithReason(harness([() => graphError(400, 9999)]).client.refresh(tokens, null, NOW), 'refresh-expired');
  });

  it('caps a long Retry-After at two days', async () => {
    const limited = await rejectsWithReason(
      harness([() => graphError(429, 32, undefined, { 'retry-after': '999999' })]).client.refresh(sentinelTokenBundle('instagram'), null, NOW),
      'rate-limited',
    );
    assert.equal(limited.details.retryAfterSeconds, 172_800);
    assert.equal(limited.details.transport, false);
  });

  it('sends nothing to revoke, upload or follow an upload, as OD8 has no Instagram publishing', async () => {
    const { client, fake } = harness([]);
    await rejectsWithReason(client.revoke(), 'account-not-eligible');
    await rejectsWithReason(client.upload(), 'account-not-eligible');
    assert.deepEqual(await client.uploadStatus(), { state: 'failed', reasonId: 'account-not-eligible' });
    fake.assertFinished();
  });
});

describe('InstagramLiveClient: identity', () => {
  it('labels the account with its @handle and keeps the professional account id', async () => {
    const { client, fake } = harness([() => jsonResponse(200, { id: '9000000000000001', user_id: '17841400000000000', username: 'studio.owner' })]);
    assert.deepEqual(await client.fetchIdentity(sentinelTokenBundle('instagram')), { accountLabel: '@studio.owner', platformAccountId: '17841400000000000' });
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    assert.equal(fake.requests[0]?.url.pathname, '/v27.0/me');
    assert.equal(fake.requests[0]?.url.searchParams.get('fields'), 'user_id,username');
  });

  it('maps a revoked token, missing permission, redirect, transport drop and oversized or unknown answers', async () => {
    const tokens = sentinelTokenBundle('instagram');
    await rejectsWithReason(harness([() => graphError(401, 190)]).client.fetchIdentity(tokens), 'token-revoked');
    await rejectsWithReason(harness([() => graphError(400, 10)]).client.fetchIdentity(tokens), 'scope-missing');
    await rejectsWithReason(harness([() => graphError(403, 9999)]).client.fetchIdentity(tokens), 'scope-missing');
    await rejectsWithReason(harness([() => emptyResponse(302, { location: 'https://evil.example/' })]).client.fetchIdentity(tokens), 'invalid-response');
    const dropped = await rejectsWithReason(harness([transportFailure()]).client.fetchIdentity(tokens), 'network');
    assert.equal(dropped.details.transport, true);
    await rejectsWithReason(harness([() => textResponse(200, '{}', { 'content-length': '2000000' })]).client.fetchIdentity(tokens), 'invalid-response');
    await rejectsWithReason(harness([() => textResponse(200, 'not json')]).client.fetchIdentity(tokens), 'invalid-response');
    await rejectsWithReason(
      harness([() => jsonResponse(200, { user_id: '1', username: 'studio', email: 'x@example.com' })]).client.fetchIdentity(tokens),
      'invalid-response',
    );
  });
});

describe('InstagramLiveClient: metrics', () => {
  function metricsRequest(targets: MetricsRequest['targets'], signal: AbortSignal = new AbortController().signal): MetricsRequest {
    return { targets, tokens: sentinelTokenBundle('instagram'), now: NOW, signal };
  }

  it('finds the reel by its shortcode, asks the reel metrics and maps the section 5.5 table', async () => {
    const { client, fake } = harness([
      () => mediaPage([{ id: OTHER_MEDIA_ID, shortcode: OTHER_SHORTCODE, media_type: 'IMAGE' }, { id: MEDIA_ID, shortcode: SHORTCODE, media_type: 'VIDEO' }]),
      () =>
        jsonResponse(200, {
          data: [
            insight('views', 1_200),
            insight('likes', 30),
            insight('comments', 4),
            insight('shares', 2),
            insight('saved', 5),
            { name: 'reach', total_value: { value: 900 } },
            insight('ig_reels_avg_watch_time', 6_543),
            insight('ig_reels_video_view_total_time', 7_851_600),
          ],
        }),
    ]);
    const results = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE)]));
    fake.assertFinished();
    fake.assertNoSentinelInUrls();
    const [listing, insights] = fake.requests;
    assert.equal(listing?.url.pathname, '/v27.0/me/media');
    assert.equal(listing?.url.searchParams.get('fields'), 'id,shortcode,media_type');
    assert.equal(listing?.url.searchParams.get('limit'), '100');
    assert.equal(listing?.hasSignal, true);
    assert.equal(insights?.url.pathname, `/v27.0/${MEDIA_ID}/insights`);
    assert.equal(insights?.url.searchParams.get('metric'), REEL_METRICS);
    assert.deepEqual(results, [
      {
        publicationId: 'pub-1',
        status: 'ok',
        platformMediaId: MEDIA_ID,
        metrics: {
          views: 1_200,
          likes: 30,
          comments: 4,
          shares: 2,
          saves: 5,
          impressions: null,
          reach: 900,
          followersGained: null,
          watchTimeSeconds: 7_852,
          averageViewDurationSeconds: 6.543,
          averageViewPercent: null,
        },
      },
    ]);
  });

  it('asks only the base metrics of an image and never returns its id for the cursor', async () => {
    const { client, fake } = harness([
      () => mediaPage([{ id: MEDIA_ID, shortcode: SHORTCODE, media_type: 'IMAGE' }]),
      () => jsonResponse(200, { data: [insight('views', 10)] }),
    ]);
    const [result] = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE)]));
    fake.assertFinished();
    assert.equal(fake.requests[1]?.url.searchParams.get('metric'), BASE_METRICS);
    assert.equal(result?.status === 'ok' ? result.platformMediaId : 'missing', null);
  });

  it('uses a cached media id without listing, and leaves out a target whose views are not there yet', async () => {
    const { client, fake } = harness([() => jsonResponse(200, { data: [] })]);
    const results = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE, MEDIA_ID)]));
    fake.assertFinished();
    assert.equal(fake.requests[0]?.url.pathname, `/v27.0/${MEDIA_ID}/insights`);
    assert.equal(fake.requests[0]?.url.searchParams.get('metric'), REEL_METRICS);
    assert.deepEqual(results, []);
  });

  it('reads a shortcode missing from a complete listing, or not a shortcode at all, as not-found', async () => {
    const { client, fake } = harness([() => mediaPage([{ id: OTHER_MEDIA_ID, shortcode: OTHER_SHORTCODE, media_type: 'VIDEO' }])]);
    const results = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE), metricTarget('pub-2', 'bad/code')]));
    fake.assertFinished();
    assert.deepEqual(results, [
      { publicationId: 'pub-1', status: 'not-found' },
      { publicationId: 'pub-2', status: 'not-found' },
    ]);
  });

  it('follows the paging cursor in its own query, never the next URL, and stops once every shortcode is found', async () => {
    const { client, fake } = harness([
      () => mediaPage([{ id: OTHER_MEDIA_ID, shortcode: OTHER_SHORTCODE, media_type: 'VIDEO' }], 'QVFIUmN1cnNvcjE'),
      () => mediaPage([{ id: MEDIA_ID, shortcode: SHORTCODE, media_type: 'VIDEO' }], 'QVFIUmN1cnNvcjI'),
      () => jsonResponse(200, { data: [insight('views', 5)] }),
    ]);
    const results = await client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE)]));
    fake.assertFinished();
    const second = fake.requests[1];
    assert.equal(second?.url.origin, 'https://graph.instagram.com');
    assert.equal(second?.url.searchParams.get('after'), 'QVFIUmN1cnNvcjE');
    assert.equal(second?.url.searchParams.get('access_token'), null);
    assert.equal(results[0]?.status, 'ok');
  });

  it('leaves a shortcode not reached within the five-page budget for the next pass', async () => {
    const pages = Array.from({ length: 5 }, (_unused, index) => () => mediaPage([{ id: `1790000000000010${index}`, shortcode: `Dother${index}xx`, media_type: 'VIDEO' }], `QVFIUmN1cnNvc${index}`));
    const { client, fake } = harness(pages);
    assert.deepEqual(await client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE)])), []);
    fake.assertFinished();
  });

  it('reads code 100 subcode 33 as not-found, but any other code 100 as a fault that ends the pass', async () => {
    const gone = harness([() => graphError(400, 100, 33)]);
    assert.deepEqual(await gone.client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE, MEDIA_ID)])), [{ publicationId: 'pub-1', status: 'not-found' }]);
    await rejectsWithReason(harness([() => graphError(400, 100)]).client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE, MEDIA_ID)])), 'invalid-response');
    await rejectsWithReason(harness([() => graphError(400, 80002)]).client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE, MEDIA_ID)])), 'quota-exhausted');
  });

  it('sends nothing once the pass budget is spent', async () => {
    const controller = new AbortController();
    controller.abort();
    const { client, fake } = harness([]);
    await rejectsWithReason(client.fetchMetrics(metricsRequest([metricTarget('pub-1', SHORTCODE)], controller.signal)), 'network');
    fake.assertFinished();
  });
});
