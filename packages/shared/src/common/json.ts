import { z } from 'zod';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Any JSON value; finite numbers only, because NaN and Infinity do not survive JSON.stringify. */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export type JsonObject = { [key: string]: JsonValue };

export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), JsonValueSchema);

export class NotJsonSerializableError extends Error {
  constructor(readonly path: string) {
    super(`Value at ${path || '<root>'} is not JSON-serializable`);
    this.name = 'NotJsonSerializableError';
  }
}

/**
 * Deterministic JSON: object keys sorted by code unit, no whitespace. Its sha-256 is the
 * `contentHash` of JSON-defined versions (recipes), so equal content always hashes equally.
 */
export function canonicalJson(value: unknown, path = ''): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NotJsonSerializableError(path);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalJson(item, `${path}[${index}]`)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry, `${path}.${key}`)}`);
    return `{${entries.join(',')}}`;
  }
  throw new NotJsonSerializableError(path);
}
