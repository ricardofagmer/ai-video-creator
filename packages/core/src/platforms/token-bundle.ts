import { inspect } from 'node:util';
import { ConnectionIdSchema, PlatformSchema, type Platform } from '@studio/shared/platforms';
import { IsoDateTimeSchema } from '@studio/shared/run-format';
import { z } from 'zod';
import { type RedactableValue, type RevealedRedactableValue } from '../secrets/secret';

/*
 * The OAuth token bundle (SPEC 0007 sections 4.3 and 5.2). Node only, and never exported from
 * `@studio/shared`: it crosses a process boundary only through the Keychain item, as the base64url
 * of its JSON, at most `MAX_ENCODED_TOKEN_BUNDLE_BYTES`. In memory every token value sits inside a
 * `SecretToken`, so a log, an error, `JSON.stringify` or `util.inspect` prints `<redacted>` (K3, K7).
 */

/** What every stringification of a token prints. */
export const REDACTED_TOKEN_TEXT = '<redacted>';

/**
 * The Keychain password bound (finding S5, lowered from the 16 KiB of section 5.2): `security -i`
 * reads each command line into a 4 KiB buffer and would cut a longer one, and with `-U` a cut item
 * replaces a good one. The vault refuses a write line over 3,800 bytes; its fixed part is under
 * 200 bytes, so an encoded bundle within this bound always fits.
 */
export const MAX_ENCODED_TOKEN_BUNDLE_BYTES = 3_600;

/** The longest token text a bundle holds (finding S5); real platform tokens are far shorter. */
export const MAX_TOKEN_TEXT_CHARS = 1_024;

/**
 * One token, code, verifier or encoded bundle held in memory only. The value lives in an ES private
 * field; `revealForPlatformCall` is the one accessor, used where a request body or the vault's stdin
 * is built.
 */
export class SecretToken implements RevealedRedactableValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  revealForPlatformCall(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  /**
   * Replaces every exact occurrence of the value in `text`, for the redactor (SPEC 0007 section
   * 5.2). The value never leaves this class and no regular expression is built from it.
   */
  replaceOccurrences(text: string, replacement: string): { text: string; count: number } {
    if (this.#value.length === 0 || !text.includes(this.#value)) return { text, count: 0 };
    const parts = text.split(this.#value);
    return { text: parts.join(replacement), count: parts.length - 1 };
  }

  /** True when `other` holds exactly this value: it finds the value once in it and nothing else. */
  hasSameValue(other: RedactableValue): boolean {
    if (this.#value.length === 0) return false;
    const replaced = other.replaceOccurrences(this.#value, '');
    return replaced.count === 1 && replaced.text === '';
  }

  toString(): string {
    return REDACTED_TOKEN_TEXT;
  }

  toJSON(): string {
    return REDACTED_TOKEN_TEXT;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED_TOKEN_TEXT;
  }

  [inspect.custom](): string {
    return `SecretToken(${REDACTED_TOKEN_TEXT})`;
  }
}

/** A token value as a platform returns it: printable ASCII, no spaces, bounded. */
const TokenTextSchema = z
  .string()
  .max(MAX_TOKEN_TEXT_CHARS)
  .regex(/^[\x21-\x7e]+$/);

/** The JSON shape inside the Keychain item; every object `.strict()` (K10). */
const StoredTokenBundleSchema = z
  .object({
    format: z.literal(1),
    platform: PlatformSchema,
    connectionId: ConnectionIdSchema,
    accessToken: TokenTextSchema,
    accessExpiresAt: IsoDateTimeSchema,
    refreshToken: TokenTextSchema.nullable(),
    refreshExpiresAt: IsoDateTimeSchema.nullable(),
    scopes: z.array(z.string().max(120)).max(12),
    obtainedAt: IsoDateTimeSchema,
  })
  .strict();

/** The bundle in memory: the same fields, with the two tokens wrapped. */
export interface TokenBundle {
  format: 1;
  platform: Platform;
  connectionId: string;
  accessToken: SecretToken;
  accessExpiresAt: string;
  refreshToken: SecretToken | null;
  refreshExpiresAt: string | null;
  scopes: string[];
  obtainedAt: string;
}

/** A bundle that cannot be encoded or decoded; the message names the platform and the problem only. */
export class TokenBundleInvalidError extends Error {
  readonly category = 'internal';

  constructor(readonly problem: 'too-large' | 'corrupt' | 'invalid-fields') {
    super(`Token bundle refused (${problem})`);
    this.name = 'TokenBundleInvalidError';
  }
}

/**
 * The Keychain password: base64url of the bundle's JSON. Throws `TokenBundleInvalidError` when a
 * field breaks the schema or the result exceeds `MAX_ENCODED_TOKEN_BUNDLE_BYTES`; the value never
 * reaches the error.
 */
export function encodeTokenBundle(bundle: TokenBundle): SecretToken {
  const stored = StoredTokenBundleSchema.safeParse({
    format: bundle.format,
    platform: bundle.platform,
    connectionId: bundle.connectionId,
    accessToken: bundle.accessToken.revealForPlatformCall(),
    accessExpiresAt: bundle.accessExpiresAt,
    refreshToken: bundle.refreshToken === null ? null : bundle.refreshToken.revealForPlatformCall(),
    refreshExpiresAt: bundle.refreshExpiresAt,
    scopes: bundle.scopes,
    obtainedAt: bundle.obtainedAt,
  });
  if (!stored.success) throw new TokenBundleInvalidError('invalid-fields');
  const encoded = Buffer.from(JSON.stringify(stored.data), 'utf8').toString('base64url');
  if (encoded.length > MAX_ENCODED_TOKEN_BUNDLE_BYTES) throw new TokenBundleInvalidError('too-large');
  return new SecretToken(encoded);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // The parser's message can quote the input, which is token material: report the problem only.
    throw new TokenBundleInvalidError('corrupt');
  }
}

/** Decodes a Keychain password; anything outside the schema is `corrupt`, never guessed. */
export function decodeTokenBundle(encoded: SecretToken): TokenBundle {
  const text = encoded.revealForPlatformCall();
  if (text.length === 0 || text.length > MAX_ENCODED_TOKEN_BUNDLE_BYTES || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new TokenBundleInvalidError('corrupt');
  }
  const parsed = StoredTokenBundleSchema.safeParse(parseJson(Buffer.from(text, 'base64url').toString('utf8')));
  if (!parsed.success) throw new TokenBundleInvalidError('corrupt');
  const stored = parsed.data;
  return {
    format: 1,
    platform: stored.platform,
    connectionId: stored.connectionId,
    accessToken: new SecretToken(stored.accessToken),
    accessExpiresAt: stored.accessExpiresAt,
    refreshToken: stored.refreshToken === null ? null : new SecretToken(stored.refreshToken),
    refreshExpiresAt: stored.refreshExpiresAt,
    scopes: stored.scopes,
    obtainedAt: stored.obtainedAt,
  };
}

/** Section 5.2: the watcher refreshes when the access token expires within 5 minutes. */
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 300_000;

/** True when the access token is expired or expires within the refresh margin. */
export function accessTokenNeedsRefresh(bundle: Pick<TokenBundle, 'accessExpiresAt'>, now: Date): boolean {
  return Date.parse(bundle.accessExpiresAt) - now.getTime() <= ACCESS_TOKEN_REFRESH_MARGIN_MS;
}
