const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_CHARACTERS = 10;
const RANDOM_CHARACTERS = 16;

export interface IdempotencyKeySources {
  nowMs: () => number;
  /** Fills the array with random bytes; the browser's `crypto.getRandomValues` by default. */
  fillRandom: (bytes: Uint8Array) => void;
}

const browserSources: IdempotencyKeySources = {
  nowMs: () => Date.now(),
  fillRandom: (bytes) => {
    crypto.getRandomValues(bytes);
  },
};

/**
 * The `idempotencyKey` of one publish click (SPEC 0007 section 5.4): a ULID, 48-bit millisecond
 * time in 10 characters then 80 random bits in 16, the shape `UlidSchema` checks. It is created
 * when the dialog opens, so a double click or a resend after a lost answer carries the same key.
 * 256 is a multiple of 32, so `byte % 32` is unbiased. Clock and randomness are injectable.
 */
export function newIdempotencyKey(sources: IdempotencyKeySources = browserSources): string {
  let remaining = Math.max(0, Math.floor(sources.nowMs()));
  let time = '';
  for (let index = 0; index < TIME_CHARACTERS; index += 1) {
    time = CROCKFORD_BASE32.charAt(remaining % 32) + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = new Uint8Array(RANDOM_CHARACTERS);
  sources.fillRandom(bytes);
  let random = '';
  for (const byte of bytes) random += CROCKFORD_BASE32.charAt(byte % 32);
  return time + random;
}
