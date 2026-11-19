/**
 * Derived OpenTelemetry ids (ADR 0006 "Consequences": derived span ids must be stable, so two
 * exports of one run are identical). The run files store no OpenTelemetry ids, so each id is a
 * 64-bit FNV-1a hash of the studio ids it stands for. FNV is not a security hash; it only needs to
 * be stable and spread well, and it keeps this module free of any Node module.
 */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;
const NON_ZERO_FALLBACK = '0000000000000001';

function fnv1a64Hex(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  const hex = hash.toString(16).padStart(16, '0');
  // An all-zero id is invalid in OTLP.
  return hex === '0000000000000000' ? NON_ZERO_FALLBACK : hex;
}

/** 32 hex characters for one run or curation; `subject` is `run:<runId>` or `curation:<curationId>`. */
export function traceIdFor(subject: string): string {
  return `${fnv1a64Hex(`trace-high:${subject}`)}${fnv1a64Hex(`trace-low:${subject}`)}`;
}

/** 16 hex characters for one span of the trace; `spanKey` is unique inside the trace. */
export function spanIdFor(subject: string, spanKey: string): string {
  return fnv1a64Hex(`span:${subject}:${spanKey}`);
}
