import { z } from 'zod';

/**
 * The subset of the OpenTelemetry OTLP JSON trace encoding the export writes (ADR 0006 option 2):
 * a `resourceSpans` document with lowercase hex trace and span ids, int64 times as decimal strings
 * and enums as integers. Plain JSON, no SDK and no dependency; browser-safe.
 */
export type OtlpAnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: OtlpAnyValue[] } };

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

/** `SPAN_KIND_INTERNAL`: every exported span is work inside the studio. */
export const OTLP_SPAN_KIND_INTERNAL = 1;

/** `STATUS_CODE_UNSET`, `STATUS_CODE_OK`, `STATUS_CODE_ERROR`. No status message is ever written. */
export const otlpStatusCode = { unset: 0, ok: 1, error: 2 } as const;
export type OtlpStatusCode = (typeof otlpStatusCode)[keyof typeof otlpStatusCode];

export interface OtlpSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: OtlpKeyValue[];
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  /** Absent on the root span of the trace. */
  parentSpanId?: string;
  name: string;
  kind: typeof OTLP_SPAN_KIND_INTERNAL;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  events: OtlpSpanEvent[];
  status: { code: OtlpStatusCode };
}

export interface OtlpScopeSpans {
  scope: { name: string; version: string };
  spans: OtlpSpan[];
}

export interface OtlpResourceSpans {
  resource: { attributes: OtlpKeyValue[] };
  scopeSpans: OtlpScopeSpans[];
}

export interface OtlpTraceDocument {
  resourceSpans: OtlpResourceSpans[];
}

const hexTraceId = z.string().regex(/^[0-9a-f]{32}$/).refine((id) => /[1-9a-f]/.test(id), 'trace id must not be all zeros');
const hexSpanId = z.string().regex(/^[0-9a-f]{16}$/).refine((id) => /[1-9a-f]/.test(id), 'span id must not be all zeros');
const unixNano = z.string().regex(/^[0-9]{1,20}$/);

const OtlpAnyValueSchema: z.ZodType<OtlpAnyValue> = z.lazy(() =>
  z.union([
    z.object({ stringValue: z.string() }).strict(),
    z.object({ intValue: z.string().regex(/^-?[0-9]{1,19}$/) }).strict(),
    z.object({ doubleValue: z.number().finite() }).strict(),
    z.object({ arrayValue: z.object({ values: z.array(OtlpAnyValueSchema) }).strict() }).strict(),
  ]),
);

const OtlpKeyValueSchema = z.object({ key: z.string().min(1), value: OtlpAnyValueSchema }).strict();

const OtlpSpanSchema = z
  .object({
    traceId: hexTraceId,
    spanId: hexSpanId,
    parentSpanId: hexSpanId.optional(),
    name: z.string().min(1).max(128),
    kind: z.literal(OTLP_SPAN_KIND_INTERNAL),
    startTimeUnixNano: unixNano,
    endTimeUnixNano: unixNano,
    attributes: z.array(OtlpKeyValueSchema),
    events: z.array(z.object({ timeUnixNano: unixNano, name: z.string().min(1).max(128), attributes: z.array(OtlpKeyValueSchema) }).strict()),
    status: z.object({ code: z.union([z.literal(0), z.literal(1), z.literal(2)]) }).strict(),
  })
  .strict();

/** Shape check of an exported document; readers and tests use it, the mapper builds the types above. */
export const OtlpTraceDocumentSchema = z
  .object({
    resourceSpans: z.array(
      z
        .object({
          resource: z.object({ attributes: z.array(OtlpKeyValueSchema) }).strict(),
          scopeSpans: z.array(
            z.object({ scope: z.object({ name: z.string().min(1), version: z.string().min(1) }).strict(), spans: z.array(OtlpSpanSchema) }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
