import { type JsonValue } from '@studio/shared/run-format';
import { type RedactableValue } from '../secrets/secret';
import { BIOMETRIC_REPLACEMENT, SECRET_PATTERNS, SECRET_REPLACEMENT } from './redaction.patterns';

/** Per string; larger text is refused, not truncated, so nothing unredacted slips past a cut. */
export const MAX_REDACTION_INPUT_CHARS = 1_000_000;
export const MAX_REDACTION_DEPTH = 64;
export const MAX_REDACTION_NODES = 100_000;

export type RedactionFailureReason = 'input-too-large' | 'too-deep' | 'too-many-nodes' | 'biometric-source-unavailable' | 'internal';

/** Raised inside the pure redactor; the service turns it into a typed failure, never raw input. */
export class RedactionLimitError extends Error {
  constructor(readonly reason: Extract<RedactionFailureReason, 'input-too-large' | 'too-deep' | 'too-many-nodes'>) {
    super(`Redaction refused the input (${reason})`);
    this.name = 'RedactionLimitError';
  }
}

export interface RedactionCounts {
  secrets: number;
  patterns: number;
  biometric: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** `/a/b/`, `/a/b`, its `~/` form under the home folder and its URL-encoded form. */
function pathSpellings(path: string, homeDirectory: string): string[] {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const spellings = new Set<string>([trimmed]);
  if (homeDirectory.length > 1 && trimmed.startsWith(`${homeDirectory}/`)) spellings.add(`~${trimmed.slice(homeDirectory.length)}`);
  const encoded = encodeURI(trimmed);
  if (encoded !== trimmed) spellings.add(encoded);
  return [...spellings];
}

/**
 * Matches a registered path, or anything below it, as a whole path component: `/x/voice` is
 * matched in `/x/voice/a.wav` but not in `/x/voice2`. The sub-path stops at whitespace and
 * quotes, so a file name after a space in a sub-path is not covered (registered paths are
 * matched whole, spaces included).
 */
function compileBiometricPattern(paths: readonly string[], homeDirectory: string): RegExp | null {
  const spellings = paths.flatMap((path) => pathSpellings(path, homeDirectory)).filter((spelling) => spelling.length > 1);
  if (spellings.length === 0) return null;
  // Longest first, so a nested registration is consumed by its longest spelling.
  const alternatives = [...new Set(spellings)].sort((left, right) => right.length - left.length).map(escapeRegExp);
  return new RegExp(`(?:${alternatives.join('|')})(?![^/\\s"'<>,;)\\]}])(?:/[^\\s"'<>,;)\\]}]*)?`, 'g');
}

/** Counters of one top-level redaction call. */
export interface RedactionPass {
  counts: RedactionCounts;
  nodes: number;
}

export function newRedactionPass(): RedactionPass {
  return { counts: { secrets: 0, patterns: 0, biometric: 0 }, nodes: 0 };
}

/**
 * One snapshot of loaded secrets and registered biometric paths, compiled once and reused. Order
 * of a pass: exact secret values first (they may match no pattern), then secret patterns, then
 * biometric paths. Holds no per-call state; counters live in the `RedactionPass`.
 */
export class CompiledRedaction {
  private readonly biometricPattern: RegExp | null;

  constructor(
    private readonly secrets: readonly RedactableValue[],
    biometricPaths: readonly string[],
    homeDirectory: string,
  ) {
    this.biometricPattern = compileBiometricPattern(biometricPaths, homeDirectory);
  }

  redactText(input: string, pass: RedactionPass): string {
    if (input.length > MAX_REDACTION_INPUT_CHARS) throw new RedactionLimitError('input-too-large');
    let text = input;
    for (const secret of this.secrets) {
      const result = secret.replaceOccurrences(text, SECRET_REPLACEMENT);
      text = result.text;
      pass.counts.secrets += result.count;
    }
    for (const { pattern, replacement } of SECRET_PATTERNS) {
      // A function replacer, so each match is counted; `$n` refers to the pattern's own groups.
      text = text.replace(pattern, (...match: unknown[]) => {
        pass.counts.patterns += 1;
        return replacement.replace(/\$(\d)/g, (_token, group: string) => {
          const value = match[Number.parseInt(group, 10)];
          return typeof value === 'string' ? value : '';
        });
      });
    }
    if (this.biometricPattern !== null) {
      text = text.replace(this.biometricPattern, () => {
        pass.counts.biometric += 1;
        return BIOMETRIC_REPLACEMENT;
      });
    }
    return text;
  }

  /** Redacts every string and every object key; numbers, booleans and null pass unchanged. */
  redactJson(value: JsonValue, pass: RedactionPass, depth = 0): JsonValue {
    if (depth > MAX_REDACTION_DEPTH) throw new RedactionLimitError('too-deep');
    pass.nodes += 1;
    if (pass.nodes > MAX_REDACTION_NODES) throw new RedactionLimitError('too-many-nodes');
    if (typeof value === 'string') return this.redactText(value, pass);
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => this.redactJson(item, pass, depth + 1));
    // fromEntries defines own properties, so a "__proto__" key stays data and never a prototype.
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [this.redactText(key, pass), this.redactJson(item, pass, depth + 1)]),
    );
  }
}
