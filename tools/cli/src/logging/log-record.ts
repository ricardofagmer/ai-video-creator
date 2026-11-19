import { type JsonObject, type JsonValue } from '@studio/shared/run-format';

export type CliLogLevel = 'fatal' | 'error' | 'warn' | 'info';

/** One Nest logger call, made JSON before redaction so every string in it is redacted. */
export interface LogRecord {
  level: CliLogLevel;
  context: string | null;
  message: JsonValue;
  details: JsonValue[];
}

const MAX_DEPTH = 8;
const MAX_ITEMS = 100;
const CONTEXT_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

function toJsonValue(value: unknown, depth = 0): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return null;
  if (depth >= MAX_DEPTH) return '<depth-limit>';
  // Name and message only: a stack adds file paths of this machine and nothing the owner needs.
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item: unknown) => toJsonValue(item, depth + 1));
  // fromEntries defines own properties, so a "__proto__" key stays data.
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [key, toJsonValue(item, depth + 1)]),
  );
}

/** Nest calls a `LoggerService` as `(message, ...params, context)`; a trailing string is the context. */
export function toLogRecord(level: CliLogLevel, message: unknown, optionalParams: readonly unknown[]): LogRecord {
  const last = optionalParams.at(-1);
  const hasContext = typeof last === 'string';
  const details = hasContext ? optionalParams.slice(0, -1) : optionalParams;
  return {
    level,
    context: hasContext && CONTEXT_PATTERN.test(last) ? last : null,
    message: toJsonValue(message),
    details: details.filter((detail) => detail !== undefined).map((detail) => toJsonValue(detail)),
  };
}

export function toRedactableJson(record: LogRecord): JsonObject {
  return { context: record.context, message: record.message, details: record.details };
}

/**
 * `RedactorService` reports its own failures through the logger; redacting that line could fail
 * again without end, so it is written from its fixed fields only.
 */
export function isRedactorFailureNotice(record: LogRecord): boolean {
  return record.context === 'RedactorService';
}
