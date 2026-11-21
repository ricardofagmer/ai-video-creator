import { type Platform } from '@studio/shared/platforms';
import { SecretToken, type TokenBundle } from './token-bundle';

/*
 * Test-only token material (SPEC 0007 AC 41, AC 60). Every value is an obvious sentinel, never a
 * real token, so a scan of files, rows, logs and errors can prove none of them leaked. Helpers
 * only: the `.harness.test.ts` name keeps the file out of the build; it declares no test.
 */

export const SENTINEL_ACCESS_TOKEN = 'SENTINEL-ACCESS-TOKEN-amkcqdev';
export const SENTINEL_REFRESH_TOKEN = 'SENTINEL-REFRESH-TOKEN-amkcqdev';
export const SENTINEL_AUTHORIZATION_CODE = 'SENTINEL-AUTH-CODE-amkcqdev';
export const SENTINEL_CLIENT_SECRET = 'SENTINEL-CLIENT-SECRET-amkcqdev';
export const SENTINEL_CLIENT_ID = 'SENTINEL-CLIENT-ID-a41c0de7';

/** Every sentinel a leak scan looks for. */
export const ALL_SENTINELS: readonly string[] = [
  SENTINEL_ACCESS_TOKEN,
  SENTINEL_REFRESH_TOKEN,
  SENTINEL_AUTHORIZATION_CODE,
  SENTINEL_CLIENT_SECRET,
  SENTINEL_CLIENT_ID,
];

export const FIXTURE_CONNECTION_ID = '01JD2Q7F3M8V5K9X4T6R2N0C0N';

/** A bundle holding the sentinel tokens; `overrides` replace whole fields. */
export function sentinelTokenBundle(platform: Platform, overrides: Partial<TokenBundle> = {}): TokenBundle {
  return {
    format: 1,
    platform,
    connectionId: FIXTURE_CONNECTION_ID,
    accessToken: new SecretToken(SENTINEL_ACCESS_TOKEN),
    accessExpiresAt: '2026-11-20T11:00:00.000Z',
    refreshToken: new SecretToken(SENTINEL_REFRESH_TOKEN),
    refreshExpiresAt: null,
    scopes: ['scope-metrics'],
    obtainedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

/** The sentinels found in `text`; empty when none leaked. */
export function sentinelsIn(text: string): string[] {
  return ALL_SENTINELS.filter((sentinel) => text.includes(sentinel));
}
