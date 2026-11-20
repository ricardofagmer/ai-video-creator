import { CorrelationIdSchema } from '../common/ids';
import { StepKeySchema } from '../run-format/step-key';
import { type OtlpAnyValue, type OtlpKeyValue } from './otlp';

/**
 * How an allowlisted attribute's value is checked before it is exported. Each rule admits only an
 * id, a token from a closed vocabulary, a number or a `ref@version`, so even an allowlisted key
 * cannot carry free text, a path, a URL or a message (ADR 0006 "Privacy rules").
 */
export type TraceAttributeRule =
  | 'ulid'
  | 'step-key'
  | 'correlation-id'
  | 'vocabulary'
  | 'vocabulary-list'
  | 'count'
  | 'amount'
  | 'version'
  | 'version-list'
  | 'service-name'
  | 'service-version';

export type TraceAttributeScope = 'resource' | 'span';

export interface AllowedAttribute {
  rule: TraceAttributeRule;
  scope: TraceAttributeScope;
}

function span(rule: TraceAttributeRule): AllowedAttribute {
  return { rule, scope: 'span' };
}

/**
 * The ADR 0006 attribute allowlist, the only source of exported attributes. A key that is not here,
 * or a value its rule refuses, is dropped and counted; nothing else reaches the file.
 */
export const TRACE_ATTRIBUTE_ALLOWLIST: ReadonlyMap<string, AllowedAttribute> = new Map<string, AllowedAttribute>([
  // Resource: service.name and service.version only.
  ['service.name', { rule: 'service-name', scope: 'resource' }],
  ['service.version', { rule: 'service-version', scope: 'resource' }],
  // Ids.
  ['studio.run.id', span('ulid')],
  ['studio.stage.id', span('vocabulary')],
  ['studio.step.key', span('step-key')],
  ['studio.session.id', span('ulid')],
  ['studio.curation.id', span('ulid')],
  ['studio.correlation.id', span('correlation-id')],
  // Names from closed vocabularies.
  ['studio.run.status', span('vocabulary')],
  ['studio.run.status.from', span('vocabulary')],
  ['studio.step.name', span('vocabulary')],
  ['studio.step.status', span('vocabulary')],
  ['studio.session.role', span('vocabulary')],
  ['studio.model.id', span('vocabulary')],
  ['studio.provider.name', span('vocabulary')],
  ['studio.check.id', span('vocabulary')],
  ['studio.check.outcome', span('vocabulary')],
  ['studio.check.passed', span('vocabulary-list')],
  ['studio.check.failed', span('vocabulary-list')],
  ['studio.reason.id', span('vocabulary')],
  ['studio.outcome', span('vocabulary')],
  ['studio.gate.name', span('vocabulary')],
  ['studio.control.request', span('vocabulary')],
  ['studio.review.subject', span('vocabulary')],
  ['studio.recovery.action', span('vocabulary')],
  ['studio.curation.status', span('vocabulary')],
  // Numbers.
  ['studio.step.attempt', span('count')],
  ['studio.curation.attempt', span('count')],
  ['studio.duration.ms', span('count')],
  ['studio.cost.usd', span('amount')],
  ['studio.tokens.input', span('count')],
  ['studio.tokens.output', span('count')],
  ['studio.tokens.cache_read', span('count')],
  ['studio.tokens.cache_write', span('count')],
  ['studio.review.overall', span('amount')],
  ['studio.review.score_count', span('count')],
  ['studio.event.count', span('count')],
  ['studio.log.count', span('count')],
  ['studio.check.count', span('count')],
  ['studio.recovery.count', span('count')],
  ['studio.unmapped.count', span('count')],
  ['studio.collected.runs', span('count')],
  ['studio.collected.notes', span('count')],
  ['studio.collected.evidence', span('count')],
  ['studio.collected.declined', span('count')],
  // Versions.
  ['studio.prompt.refs', span('version-list')],
  ['studio.skill.refs', span('version-list')],
  ['studio.instruction.version', span('version')],
]);

/** `video-studio-watcher` writes every source file of the export (RUN-FORMAT sections 4 and 23). */
export const TRACE_SERVICE_NAMES: readonly string[] = ['video-studio-watcher', 'video-studio-api'];

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** Lowercase tokens: stage, step, status, role, model, check, reason and outcome names. */
const VOCABULARY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
/** `assetId@version`, `recipeId@version`, `curator@1`. */
const VERSION_PATTERN = /^[a-z0-9-]{1,64}@[0-9]{1,9}$/;
const SERVICE_VERSION_PATTERN = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/;
const MAX_LIST_ITEMS = 16;

export type TraceAttributeInput = string | number | readonly string[] | null | undefined;

function stringValue(value: string): OtlpAnyValue {
  return { stringValue: value };
}

function tokenList(value: TraceAttributeInput, pattern: RegExp): OtlpAnyValue | null {
  if (typeof value !== 'object' || value === null || value.length > MAX_LIST_ITEMS) return null;
  const values: OtlpAnyValue[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !pattern.test(item)) return null;
    values.push(stringValue(item));
  }
  return { arrayValue: { values } };
}

function matching(value: TraceAttributeInput, test: (text: string) => boolean): OtlpAnyValue | null {
  return typeof value === 'string' && test(value) ? stringValue(value) : null;
}

function encodeValue(rule: TraceAttributeRule, value: TraceAttributeInput): OtlpAnyValue | null {
  switch (rule) {
    case 'ulid':
      return matching(value, (text) => ULID_PATTERN.test(text));
    case 'step-key':
      return matching(value, (text) => StepKeySchema.safeParse(text).success);
    case 'correlation-id':
      return matching(value, (text) => CorrelationIdSchema.safeParse(text).success);
    case 'vocabulary':
      return matching(value, (text) => VOCABULARY_PATTERN.test(text));
    case 'vocabulary-list':
      return tokenList(value, VOCABULARY_PATTERN);
    case 'count':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? { intValue: String(value) } : null;
    case 'amount':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { doubleValue: value } : null;
    case 'version':
      return matching(value, (text) => VERSION_PATTERN.test(text));
    case 'version-list':
      return tokenList(value, VERSION_PATTERN);
    case 'service-name':
      return matching(value, (text) => TRACE_SERVICE_NAMES.includes(text));
    case 'service-version':
      return matching(value, (text) => SERVICE_VERSION_PATTERN.test(text));
  }
}

export interface AllowedAttributes {
  attributes: OtlpKeyValue[];
  /** Candidates refused: key not allowlisted, allowlisted for the other scope, or value refused. */
  dropped: number;
}

/**
 * Filters candidate attributes through the allowlist. `null` and `undefined` mean "no value" and
 * are skipped without counting; every other refusal is counted, never echoed.
 */
export function allowedAttributes(candidates: Readonly<Record<string, TraceAttributeInput>>, scope: TraceAttributeScope): AllowedAttributes {
  const attributes: OtlpKeyValue[] = [];
  let dropped = 0;
  for (const [key, value] of Object.entries(candidates)) {
    if (value === null || value === undefined) continue;
    const allowed = TRACE_ATTRIBUTE_ALLOWLIST.get(key);
    const encoded = allowed !== undefined && allowed.scope === scope ? encodeValue(allowed.rule, value) : null;
    if (encoded === null) {
      dropped += 1;
      continue;
    }
    attributes.push({ key, value: encoded });
  }
  return { attributes, dropped };
}
