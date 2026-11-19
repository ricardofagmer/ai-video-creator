import { z } from 'zod';
import { IsoDateTimeSchema } from '../common/ids';

/**
 * A13: the `settings` row (C8) holding the passphrase hash (SPEC 0002 rev 4, section 13.2). The key
 * names the row and is not a secret; the hash value itself never enters this package. Its writer is
 * the CLI (`studio passphrase set`); the api only reads it.
 */
export const PASSPHRASE_HASH_SETTING_KEY = 'auth.passphrase-hash';

/**
 * PHC string of argon2id only: `$argon2id$v=19$m=..,t=..,p=..$<salt>$<hash>`. The api fails closed on
 * any stored value that does not match, so a tampered row cannot downgrade the scheme, and the CLI
 * refuses to save a hash that does not match (section 13.2).
 */
export const ARGON2ID_PHC_PATTERN = /^\$argon2id\$v=19\$m=\d{1,8},t=\d{1,4},p=\d{1,3}\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$/;

/**
 * `POST /auth/login` body (D8). The passphrase is checked against its stored argon2id hash (A13);
 * the length cap bounds hashing work per attempt.
 */
export const LoginRequestSchema = z
  .object({
    passphrase: z.string().min(1).max(1024),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** `POST /auth/login` (200) and `GET /auth/session` (200). `POST /auth/logout` answers 204. */
export const SessionResponseSchema = z
  .object({
    authenticated: z.literal(true),
    expiresAt: IsoDateTimeSchema,
  })
  .strict();
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** `GET /health`, the only route besides login that needs no session (criterion 27). */
export const HealthResponseSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    database: z.enum(['ok', 'unavailable']),
  })
  .strict();
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
