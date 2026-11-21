import { createHash, randomBytes } from 'node:crypto';
import { oauthBounds } from '@studio/shared/platforms';
import { SecretToken } from '../token-bundle';

/*
 * PKCE and `state` (SPEC 0007 section 5.2, K9: `node:crypto` only). The verifier and the `state`
 * are secrets of the flow: they live in api memory, are never logged, and the verifier stays inside
 * a `SecretToken`.
 */

/** How a platform wants the S256 challenge encoded; `none` where it offers no PKCE (Instagram, U4). */
export type PkceChallengeEncoding = 'base64url' | 'hex' | 'none';

/** 48 random bytes are exactly 64 base64url characters, all in the RFC 7636 unreserved set. */
const VERIFIER_BYTES = (oauthBounds.verifierChars * 3) / 4;

/** Section 5.2: a 32-byte random `state`, base64url (43 characters, inside the callback's pattern). */
const STATE_BYTES = 32;

/** A fresh 64-character PKCE verifier. */
export function createPkceVerifier(): SecretToken {
  return new SecretToken(randomBytes(VERIFIER_BYTES).toString('base64url'));
}

/** The S256 challenge of `verifier`: base64url for YouTube, hex for TikTok [T1], null for `none`. */
export function pkceChallenge(verifier: SecretToken, encoding: PkceChallengeEncoding): string | null {
  if (encoding === 'none') return null;
  return createHash('sha256').update(verifier.revealForPlatformCall(), 'ascii').digest(encoding);
}

/** A fresh single-use OAuth `state`. */
export function createOAuthState(): string {
  return randomBytes(STATE_BYTES).toString('base64url');
}
