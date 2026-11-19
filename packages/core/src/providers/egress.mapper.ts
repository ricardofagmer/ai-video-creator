import { EgressEntrySchema, type EgressEntry, type EgressMeasure } from '@studio/shared/run-format';
import { type ExternalCall } from './egress';

/** pt-BR labels (D16): the summary is built from these and a number only, never from content. */
const WHAT_LABELS: Readonly<Record<EgressEntry['what'], string>> = {
  'prompt-text': 'texto do prompt',
  'tts-text': 'texto para narração',
  audio: 'áudio',
  frames: 'quadros de vídeo',
  'page-fetch': 'acesso a página',
};

const UNIT_LABELS: Readonly<Record<EgressMeasure['unit'], string>> = {
  characters: 'caracteres',
  tokens: 'tokens',
  bytes: 'bytes',
  pages: 'páginas',
};

const countFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export class InvalidEgressMeasureError extends Error {
  readonly category = 'validation';

  constructor() {
    super('An egress measure must be a non-negative integer count');
    this.name = 'InvalidEgressMeasureError';
  }
}

/** e.g. "texto do prompt, 1.240 tokens". */
export function egressSummary(what: EgressEntry['what'], measure: EgressMeasure): string {
  if (!Number.isSafeInteger(measure.amount) || measure.amount < 0) throw new InvalidEgressMeasureError();
  return `${WHAT_LABELS[what]}, ${countFormat.format(measure.amount)} ${UNIT_LABELS[measure.unit]}`;
}

/**
 * Validated against C3 so a malformed entry fails here, before it reaches `egress.jsonl`. The
 * measure is copied as a count only; the summary is built from labels and that count.
 */
export function toEgressEntry(call: ExternalCall): EgressEntry {
  return EgressEntrySchema.parse({
    provider: call.provider,
    what: call.what,
    stepKey: call.stepKey,
    sessionId: call.sessionId,
    at: call.at.toISOString(),
    summary: egressSummary(call.what, call.measure),
    measure: { unit: call.measure.unit, amount: call.measure.amount },
  });
}
