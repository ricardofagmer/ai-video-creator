import { randomBytes } from 'node:crypto';
import { type RunId, type SessionId } from '../common/ids';

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_ULID_TIME = 2 ** 48 - 1;

/**
 * ULID: 48-bit millisecond time in 10 characters, then 80 random bits in 16 characters
 * (topology section 10 ids). 256 is a multiple of 32, so `byte % 32` is unbiased.
 */
export function newUlid(nowMs: number = Date.now()): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_ULID_TIME) {
    throw new RangeError('ULID time must be an integer between 0 and 2^48 - 1');
  }
  let time = '';
  let remaining = nowMs;
  for (let index = 0; index < 10; index += 1) {
    time = CROCKFORD_BASE32.charAt(remaining % 32) + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = randomBytes(16);
  let random = '';
  for (let index = 0; index < 16; index += 1) random += CROCKFORD_BASE32.charAt(bytes.readUInt8(index) % 32);
  return time + random;
}

export function newRunId(): RunId {
  return newUlid();
}

export function newSessionId(): SessionId {
  return newUlid();
}
