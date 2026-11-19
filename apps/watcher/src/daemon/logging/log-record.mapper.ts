import { type RedactionFailureReason } from '@studio/core/redaction';
import { type JsonObject, type JsonValue } from '@studio/shared/run-format';

export type DaemonLogLevel = 'fatal' | 'error' | 'warn' | 'info';

/** One Nest logger call, made JSON before redaction so every string in it is redacted. */
export interface LogRecord {
  level: DaemonLogLevel;
  context: string | null;
  message: JsonValue;
  details: JsonValue[];
}

/** Bounds on what one log call may carry; the redactor refuses larger input anyway (fails closed). */
const MAX_DEPTH = 8;
const MAX_ITEMS = 100;

/** Context names are class names in code; anything else is not trusted to be written unredacted. */
const CONTEXT_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

const redactionFailureReasons: readonly RedactionFailureReason[] = [
  'input-too-large',
  'too-deep',
  'too-many-nodes',
  'biometric-source-unavailable',
  'internal',
];

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toJsonValue(value: unknown, depth = 0): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return null;
  if (depth >= MAX_DEPTH) return '<depth-limit>';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack ?? null };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item: unknown) => toJsonValue(item, depth + 1));
  // fromEntries defines own properties, so a "__proto__" key stays data.
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [key, toJsonValue(item, depth + 1)]),
  );
}

/**
 * Nest calls a `LoggerService` as `(message, ...params, context)`, with the stack before the
 * context for `error`. As in Nest's own console logger, a trailing string is the context.
 */
export function toLogRecord(level: DaemonLogLevel, message: unknown, optionalParams: readonly unknown[]): LogRecord {
  const last = optionalParams.at(-1);
  const hasContext = typeof last === 'string';
  const details = hasContext ? optionalParams.slice(0, -1) : optionalParams;
  return {
    level,
    context: hasContext ? last : null,
    message: toJsonValue(message),
    details: details.filter((detail) => detail !== undefined).map((detail) => toJsonValue(detail)),
  };
}

export function toRedactableJson(record: LogRecord): JsonObject {
  return { context: record.context, message: record.message, details: record.details };
}

export function safeContext(context: string | null): string | null {
  return context !== null && CONTEXT_PATTERN.test(context) ? context : null;
}

/**
 * `RedactorService` reports its own failures through the logger as `{ event, reason }`. Redacting
 * that line could fail again and report again without end, so it is written from its two
 * allowlisted enum values only, never from free text.
 */
export function redactionFailureNotice(record: LogRecord): JsonObject | null {
  if (record.context !== 'RedactorService' || !isJsonObject(record.message)) return null;
  const { event, reason } = record.message;
  const knownReason = redactionFailureReasons.find((candidate) => candidate === reason);
  if (event !== 'redaction.failed' || knownReason === undefined) return null;
  return { event: 'redaction.failed', reason: knownReason, context: 'RedactorService' };
}

/** The pino merge object and message of a redacted record. */
export function toPinoArguments(redacted: JsonValue): { fields: JsonObject; text: string | undefined } {
  if (!isJsonObject(redacted)) return { fields: { data: redacted }, text: undefined };
  const { message, details, ...rest } = redacted;
  const fields: JsonObject = { ...rest };
  if (Array.isArray(details) && details.length > 0) fields.details = details;
  if (typeof message === 'string') return { fields, text: message };
  if (message !== undefined) fields.data = message;
  return { fields, text: undefined };
}
