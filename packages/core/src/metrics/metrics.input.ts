import { z } from 'zod';
import { CreatePublicationRequestSchema, MetricImportFieldsSchema, SaveMetricSnapshotRequestSchema } from '@studio/shared/api';
import { IsoDateSchema, MetricImportIdSchema, PublicationIdSchema } from '@studio/shared/metrics';
import { CorrelationIdSchema, RunIdSchema } from '@studio/shared/run-format';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type InputIssue } from '../catalog';
import { InvalidMetricsInputError } from './metrics.errors';

/*
 * Core inputs of the metrics commands and queries (SPEC 0006 sections 4.4, 5.1 to 5.3). The C10
 * request bodies are reused as is; `recordedBy` and `importedBy` come from the session and
 * `correlationId` from `x-request-id`, never from a body (section 6). The CLI has no request id, so
 * the correlation id is nullable, as its columns are.
 */

/** The session owner, as every owner-attributed write records it. */
const ActorSchema = z.string().min(1).max(100);
const OptionalCorrelationIdSchema = CorrelationIdSchema.nullable();

export const RecordPublicationInputSchema = z
  .object({
    runId: RunIdSchema,
    request: CreatePublicationRequestSchema,
    recordedBy: ActorSchema,
    correlationId: OptionalCorrelationIdSchema,
  })
  .strict();
export type RecordPublicationInput = z.input<typeof RecordPublicationInputSchema>;

export const RemovePublicationInputSchema = z
  .object({
    runId: RunIdSchema,
    publicationId: PublicationIdSchema,
    correlationId: OptionalCorrelationIdSchema,
  })
  .strict();
export type RemovePublicationInput = z.input<typeof RemovePublicationInputSchema>;

/** The manual form: `PlatformMetrics` (the C10 body) for one publication and day, source `form`. */
export const SaveMetricSnapshotInputSchema = z
  .object({
    runId: RunIdSchema,
    publicationId: PublicationIdSchema,
    asOfDate: IsoDateSchema,
    metrics: SaveMetricSnapshotRequestSchema,
    correlationId: OptionalCorrelationIdSchema,
  })
  .strict();
export type SaveMetricSnapshotInput = z.input<typeof SaveMetricSnapshotInputSchema>;

/**
 * A CSV import as the api (multipart) and the CLI (file read with the same size limit) hand it
 * over. `file` is the raw bytes held in memory; its name and content type never reach core. The
 * byte bounds are checked by `decodeCsvBytes` as the first stage, so a refusal is reported with
 * its reason instead of a schema issue.
 */
export const ImportMetricsInputSchema = z
  .object({
    fields: MetricImportFieldsSchema,
    dryRun: z.boolean(),
    file: z.instanceof(Uint8Array),
    importedBy: ActorSchema,
    correlationId: OptionalCorrelationIdSchema,
  })
  .strict();
export type ImportMetricsInput = z.input<typeof ImportMetricsInputSchema>;

/** rules/backend.md pagination (default 20, max 100); newest first, keyed by the time-ordered id. */
export const ListMetricImportsCriteriaSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    /** The `nextCursor` of the previous page. */
    cursor: MetricImportIdSchema.optional(),
  })
  .strict();
export type ListMetricImportsCriteria = z.input<typeof ListMetricImportsCriteriaSchema>;

function issuesOf(error: z.ZodError, prefix: string): InputIssue[] {
  return error.issues.map((issue) => ({ path: [prefix, ...issue.path].filter((part) => part !== '').join('.'), message: issue.message }));
}

/** Parses untrusted input, turning zod failures into a typed domain error (paths and messages only). */
export function parseMetricsInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, prefix: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new InvalidMetricsInputError(issuesOf(parsed.error, prefix));
  return parsed.data;
}

/**
 * True when `asOfDate` (`yyyy-mm-dd`) is after today on this Mac. The owner states the day the
 * numbers describe (B11), in the same local calendar the studio uses for the cost month (L9).
 */
export function isAfterLocalToday(asOfDate: string, now: Date): boolean {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return asOfDate > `${now.getFullYear()}-${month}-${day}`;
}
