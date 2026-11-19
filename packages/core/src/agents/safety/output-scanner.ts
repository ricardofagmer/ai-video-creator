import { Injectable } from '@nestjs/common';
import { DelimiterTagSchema } from '@studio/shared/agents';
import { type JsonValue } from '@studio/shared/run-format';
import { RedactorService } from '../../redaction';
import { type OutputRejectionReason } from '../agents.errors';

export type OutputScanResult = { status: 'clean' } | { status: 'rejected'; reason: OutputRejectionReason };

// Any opening or closing C7 delimiter tag, in any letter case: an output carrying one is echoing
// untrusted data verbatim or trying to forge a block for the next hop.
const delimiterTagPattern = new RegExp(`</?(?:${DelimiterTagSchema.options.join('|')})\\b`, 'i');

function strings(value: JsonValue): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(strings);
  return Object.entries(value).flatMap(([key, item]) => [key, ...strings(item)]);
}

/**
 * Output scan of topology section 8, run on every structured output before it is written to a
 * run file or returned to the engine. A secret, a secret pattern or a registered biometric path
 * anywhere in the output, or a protocol delimiter tag, rejects the whole output: nothing is
 * repaired in place, because a model that echoes such text is not answering its packet. A
 * redactor error rejects too (fails closed).
 */
@Injectable()
export class OutputScanner {
  constructor(private readonly redactor: RedactorService) {}

  async scan(output: JsonValue): Promise<OutputScanResult> {
    if (strings(output).some((text) => delimiterTagPattern.test(text))) return { status: 'rejected', reason: 'delimiter-leak' };
    const redaction = await this.redactor.redactJson(output);
    if (redaction.status === 'failed') return { status: 'rejected', reason: 'scan-failed' };
    const { secrets, patterns, biometric } = redaction.counts;
    if (secrets + patterns > 0) return { status: 'rejected', reason: 'secret' };
    if (biometric > 0) return { status: 'rejected', reason: 'biometric' };
    return { status: 'clean' };
  }
}
