import { z } from 'zod';

/** Crockford base32 ULID: 10 time characters + 16 random characters (topology section 10). */
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const RunIdSchema = z.string().regex(ulidPattern, 'runId must be a ULID');
export type RunId = z.infer<typeof RunIdSchema>;

/** One id per agent call; it is also the packet id (topology section 10). */
export const SessionIdSchema = z.string().regex(ulidPattern, 'sessionId must be a ULID');
export type SessionId = z.infer<typeof SessionIdSchema>;

/**
 * One A/B comparison (SPEC 0003 section 4.2), the same shape as `RunId`. Declared here, beside
 * `RunIdSchema`, so C1 provenance can name it without importing C3; C3 re-exports it from
 * `run-format/comparison.ts`, its contract home.
 */
export const ComparisonIdSchema = z.string().regex(ulidPattern, 'comparisonId must be a ULID');
export type ComparisonId = z.infer<typeof ComparisonIdSchema>;

/**
 * One curation (SPEC 0005 section 4.3), the same shape as `ComparisonId`. Declared here so C1
 * provenance `curator` can name it; it is also the folder name under `<data home>/curations/`.
 */
export const CurationIdSchema = z.string().regex(ulidPattern, 'curationId must be a ULID');
export type CurationId = z.infer<typeof CurationIdSchema>;

/** One learning note row (SPEC 0003 section 4.2, `noteId: Ulid`). */
export const LearningNoteIdSchema = z.string().regex(ulidPattern, 'noteId must be a ULID');
export type LearningNoteId = z.infer<typeof LearningNoteIdSchema>;

/** A ULID with no more specific role, e.g. a schedule's `briefId` (SPEC 0006 section 4.3). */
export const UlidSchema = z.string().regex(ulidPattern, 'expected a ULID');
export type Ulid = z.infer<typeof UlidSchema>;

/**
 * One schedule (SPEC 0006 section 4.1). Declared here so C3 `run.json.schedule` can name it; it is
 * also the folder name under `<data home>/schedules/`, so it is validated before any path join.
 */
export const ScheduleIdSchema = z.string().regex(ulidPattern, 'scheduleId must be a ULID');
export type ScheduleId = z.infer<typeof ScheduleIdSchema>;

/** One `run_publications` row (SPEC 0006 section 4.3). */
export const PublicationIdSchema = z.string().regex(ulidPattern, 'publicationId must be a ULID');
export type PublicationId = z.infer<typeof PublicationIdSchema>;

/** One `metric_imports` row (SPEC 0006 section 4.3). */
export const MetricImportIdSchema = z.string().regex(ulidPattern, 'importId must be a ULID');
export type MetricImportId = z.infer<typeof MetricImportIdSchema>;

/**
 * One connected platform account (SPEC 0007 section 4.2). A reconnect issues a new one, so the
 * watcher can tell a refreshed token of an older connection from the current one.
 */
export const ConnectionIdSchema = z.string().regex(ulidPattern, 'connectionId must be a ULID');
export type ConnectionId = z.infer<typeof ConnectionIdSchema>;

/**
 * One publish attempt (SPEC 0007 section 4.2): the `publication_attempts` row id and the folder
 * name under `<data home>/platform/publish/`, so it is validated before any path join.
 */
export const PublishAttemptIdSchema = z.string().regex(ulidPattern, 'attemptId must be a ULID');
export type PublishAttemptId = z.infer<typeof PublishAttemptIdSchema>;

/** One pulled metrics batch (SPEC 0007 section 4.2); it names `platform/metrics-inbox/<batchId>.json`. */
export const MetricBatchIdSchema = z.string().regex(ulidPattern, 'batchId must be a ULID');
export type MetricBatchId = z.infer<typeof MetricBatchIdSchema>;

/** Copied from the api's `x-request-id`; allowlisted because the header is external input. */
export const CorrelationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/, 'correlationId must be 1-128 characters of [A-Za-z0-9._:-]');
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

/** Lowercase hex sha-256, the name of a blob under `assets/sha256/<2 hex>/`. */
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'expected a lowercase hex sha-256');
export type Sha256 = z.infer<typeof Sha256Schema>;

/** ISO-8601 instant with an offset or `Z`, used in run.json and every catalog row. */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Calendar date `YYYY-MM-DD` (license "date read"). */
export const IsoDateSchema = z.string().date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Unix epoch milliseconds, used by the high-frequency files now.json, events.jsonl and control.json. */
export const EpochMsSchema = z.number().int().nonnegative();
export type EpochMs = z.infer<typeof EpochMsSchema>;

/** Lowercase kebab slug used for asset, recipe, gate and check-adjacent ids. */
export const KebabIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'expected a lowercase kebab-case id')
  .max(64);

/**
 * A path relative to a run folder or a folder asset: forward slashes, no `..`, no leading `/`,
 * no empty segment. Rejecting traversal here keeps every reader confined to its root.
 */
export const RelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/, 'expected a relative path of [A-Za-z0-9._-] segments')
  .refine((value) => value.split('/').every((segment) => segment !== '.' && segment !== '..'), {
    message: 'relative path must not contain . or .. segments',
  });
export type RelativePath = z.infer<typeof RelativePathSchema>;

/** Absolute POSIX path for by-reference assets (ADR 0003 decision 2). */
export const AbsolutePathSchema = z
  .string()
  .min(2)
  .max(4096)
  .regex(/^\//, 'expected an absolute POSIX path')
  .refine((value) => !value.includes('\u0000'), { message: 'path must not contain NUL' })
  .refine((value) => value.split('/').every((segment) => segment !== '.' && segment !== '..'), {
    message: 'absolute path must not contain . or .. segments',
  });
export type AbsolutePath = z.infer<typeof AbsolutePathSchema>;
