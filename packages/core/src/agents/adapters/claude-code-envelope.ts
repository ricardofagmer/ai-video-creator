import { z } from 'zod';
import { type ProviderFailure } from '../../providers';
import { type ClaudeCodeProcessResult } from './claude-code-cli';

/**
 * The `--output-format json` envelope of one `claude -p` call (ADR 0011, observed on Claude Code
 * 2.1.329). Only these fields are read; `result` is free text and is used for classification
 * only, never copied into a run file.
 */
const EnvelopeSchema = z
  .object({
    is_error: z.boolean().optional(),
    subtype: z.string().max(64).optional(),
    api_error_status: z.number().int().nullable().optional(),
    result: z.string().optional(),
    structured_output: z.unknown().optional(),
    usage: z.unknown().optional(),
  })
  .passthrough();

export type ClaudeCodeOutcome =
  | { readonly status: 'answered'; readonly structuredOutput: unknown; readonly step: unknown }
  | { readonly status: 'failed'; readonly failure: ProviderFailure };

const PROVIDER = 'claude';

const AUTHENTICATION_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const RATE_LIMIT_STATUSES: ReadonlySet<number> = new Set([429, 529]);

// The CLI reports these in prose; the patterns classify the text and nothing of it is kept.
const RATE_LIMIT_PATTERN = /rate.?limit|usage.?limit|limit reached|overloaded|\b429\b|\b529\b/i;
const AUTHENTICATION_PATTERN = /sign.?in|log.?in|authenticat|unauthori[sz]ed|invalid api key|\b401\b|\b403\b/i;

function failureFromText(text: string): ProviderFailure {
  if (RATE_LIMIT_PATTERN.test(text)) return { class: 'rate-limit', provider: PROVIDER, retryAfterMs: null };
  if (AUTHENTICATION_PATTERN.test(text)) return { class: 'authentication', provider: PROVIDER };
  return { class: 'transient', provider: PROVIDER, reason: 'server-error' };
}

function failureFromStatus(status: number): ProviderFailure | null {
  if (AUTHENTICATION_STATUSES.has(status)) return { class: 'authentication', provider: PROVIDER };
  if (RATE_LIMIT_STATUSES.has(status)) return { class: 'rate-limit', provider: PROVIDER, retryAfterMs: null };
  if (status >= 500) return { class: 'transient', provider: PROVIDER, reason: 'server-error' };
  if (status >= 400) return { class: 'fatal', provider: PROVIDER, reason: 'rejected-request' };
  return null;
}

function parseEnvelope(stdout: string): z.infer<typeof EnvelopeSchema> | null {
  try {
    const parsed = EnvelopeSchema.safeParse(JSON.parse(stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * `--output-format stream-json` prints one JSON object per line; the last `result` line carries the
 * same envelope as `--output-format json` (observed 2026-11-24,
 * docs/specs/2026-11-24-link-reference-analysis-design.md).
 */
function parseStreamEnvelope(stdout: string): z.infer<typeof EnvelopeSchema> | null {
  const lines = stdout.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') continue;
    const envelope = parseEnvelope(line);
    if (envelope !== null && envelope['type'] === 'result') return envelope;
  }
  return null;
}

/** How the process was asked to print: one envelope, or a stream whose last `result` line is it. */
export type ClaudeCodeOutputFormat = 'json' | 'stream-json';

/**
 * Reads one finished process (spec C4, C5). An answered call hands back the structured answer
 * unvalidated and a step in the raw Anthropic usage shape the usage mapper reads. Everything
 * else is a classified failure: sign-in problems are never retried, limits follow the ADR 0002
 * ladder, and an unreadable result counts as transient.
 */
export function readClaudeCodeResult(result: ClaudeCodeProcessResult, format: ClaudeCodeOutputFormat = 'json'): ClaudeCodeOutcome {
  if (result.aborted) return { status: 'failed', failure: { class: 'cancelled', provider: PROVIDER } };
  if (result.truncated) return { status: 'failed', failure: { class: 'fatal', provider: PROVIDER, reason: 'unrecognized' } };

  const envelope = format === 'json' ? parseEnvelope(result.stdout) : parseStreamEnvelope(result.stdout);
  if (envelope === null) return { status: 'failed', failure: failureFromText(result.stderr) };

  if (envelope.is_error === true || result.exitCode !== 0) {
    const status = envelope.api_error_status;
    const byStatus = status === undefined || status === null ? null : failureFromStatus(status);
    return { status: 'failed', failure: byStatus ?? failureFromText(`${envelope.result ?? ''}\n${result.stderr}`) };
  }
  return {
    status: 'answered',
    structuredOutput: envelope.structured_output,
    step: { providerMetadata: { anthropic: { usage: envelope.usage } } },
  };
}
