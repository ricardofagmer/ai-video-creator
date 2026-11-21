import { createHash, randomBytes } from 'node:crypto';
import { type PlatformMetrics } from '@studio/shared/metrics';
import { type Platform } from '@studio/shared/platforms';
import { SecretToken } from '../../token-bundle';

/*
 * Deterministic data of the mock clients (SPEC 0007 section 5.8). Nothing here makes a request;
 * the numbers are a pure function of the publication id and the day index, and the ids a pure
 * function of the attempt id, each matching `platformVideoIdPatterns`.
 */

/**
 * The fixed code the mock authorize URL carries back to the api's own callback, so the whole
 * `state` and session path runs in mock mode. It grants nothing: only a mock client accepts it.
 */
export const MOCK_AUTHORIZATION_CODE = 'mock-authorization-code';

/** Section 5.8: the label of every mock account. */
export const MOCK_ACCOUNT_LABEL = 'Conta simulada';

/** The TikTok handle of the mock account, used to rebuild its canonical URLs. */
export const MOCK_TIKTOK_HANDLE = 'conta.simulada';

const MOCK_ACCESS_LIFETIME_MS = 3_600_000;
const MOCK_REFRESH_LIFETIME_MS = 180 * 86_400_000;

function digestOf(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

/** The account id of the mock account; matches `AccountFileSchema.platformAccountId`. */
export function mockPlatformAccountId(platform: Platform): string {
  return `mock-${platform}`;
}

/** A random, never-stored-in-a-file mock token, wrapped like a real one. */
export function mockToken(kind: 'access' | 'refresh'): SecretToken {
  return new SecretToken(`mock-${kind}-${randomBytes(24).toString('base64url')}`);
}

export function mockAccessExpiresAt(now: Date): string {
  return new Date(now.getTime() + MOCK_ACCESS_LIFETIME_MS).toISOString();
}

export function mockRefreshExpiresAt(now: Date): string {
  return new Date(now.getTime() + MOCK_REFRESH_LIFETIME_MS).toISOString();
}

/** YouTube: the last 11 ULID characters are inside `[A-Za-z0-9_-]{11}`. */
export function mockYoutubeVideoId(attemptId: string): string {
  return attemptId.slice(-11);
}

/** TikTok: 19 decimal digits derived from the attempt id, inside `[0-9]{8,24}`. */
export function mockTiktokVideoId(attemptId: string): string {
  const value = digestOf(attemptId).readBigUInt64BE(0) % 9_000_000_000_000_000_000n;
  return (value + 1_000_000_000_000_000_000n).toString(10);
}

/**
 * Cumulative mock metrics: a base from the publication id that grows with the day index, so a
 * later poll never reports fewer views. `null` where the platform reports nothing (section 5.5).
 */
export function mockMetrics(platform: Platform, publicationId: string, dayIndex: number): PlatformMetrics {
  const digest = digestOf(`${platform}:${publicationId}`);
  const day = Math.max(0, Math.min(dayIndex, 180)) + 1;
  const base = 50 + (digest.readUInt16BE(0) % 950);
  const views = base * day;
  const likes = Math.floor(views * (0.02 + (digest[2] ?? 0) / 10_000));
  const comments = Math.floor(views * 0.003);
  const shares = Math.floor(views * 0.002);
  return {
    views,
    likes,
    comments,
    shares,
    saves: platform === 'instagram' ? Math.floor(views * 0.004) : null,
    impressions: null,
    reach: platform === 'instagram' ? Math.floor(views * 0.8) : null,
    followersGained: platform === 'youtube' ? Math.floor(day / 3) : null,
    watchTimeSeconds: platform === 'tiktok' ? null : views * 12,
    averageViewDurationSeconds: platform === 'tiktok' ? null : 12,
    averageViewPercent: platform === 'youtube' ? 40 + ((digest[3] ?? 0) % 40) : null,
  };
}
