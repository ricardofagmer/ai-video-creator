import { z } from 'zod';
import { IsoDateSchema, MetricImportIdSchema, PublicationIdSchema, PublishAttemptIdSchema, RunIdSchema } from '../common/ids';
import { METRIC_HISTORY_SHOWN, metricsBounds, platformVideoIdPatterns } from '../metrics/constants';
import {
  MetricRowIssueSchema,
  MetricSnapshotOriginSchema,
  PlatformSchema,
  PublicationOriginSchema,
  type MetricImportRefusedReason,
} from '../metrics/enums';
import { PublicationSchema } from '../metrics/publication';
import { MetricSnapshotSchema, PlatformMetricsSchema } from '../metrics/snapshot';
import { PollStopReasonSchema } from '../platforms/enums';
import { type ApiRev5ErrorReason } from './common';

/*
 * C10 rev 5 metrics routes (SPEC 0006 sections 4.4, 5.1 to 5.3). `recordedBy`, `importedBy` and
 * `correlationId` come from the session and `x-request-id`, never from a body. Every URL, id and
 * number is rendered by the web as a text node.
 */

export const PublicationParamsSchema = z.object({ runId: RunIdSchema, publicationId: PublicationIdSchema }).strict();
export type PublicationParams = z.infer<typeof PublicationParamsSchema>;

export const MetricSnapshotParamsSchema = z
  .object({ runId: RunIdSchema, publicationId: PublicationIdSchema, asOfDate: IsoDateSchema })
  .strict();
export type MetricSnapshotParams = z.infer<typeof MetricSnapshotParamsSchema>;

/**
 * `POST /runs/:runId/publications`: the owner's link to the published video. The api runs
 * `parsePublicationUrl` and stores only the rebuilt canonical URL. Only an `approved` run accepts it.
 */
export const CreatePublicationRequestSchema = z
  .object({
    url: z.string().trim().min(1).max(metricsBounds.urlChars),
    publishedOn: IsoDateSchema.optional(),
  })
  .strict();
export type CreatePublicationRequest = z.infer<typeof CreatePublicationRequestSchema>;

/**
 * Rev 7 (SPEC 0007 sections 5.5 and 5.9): the polling line of a publication. `active`: polled on the
 * OD3 cadence, next on `nextPollOn` ("Próxima coleta: amanhã"). `stopped`: never polled again, for
 * `stopReason` ("Coleta encerrada: 180 dias"). `not-polled`: the platform's `metrics` status is not
 * `connected`, or the publication is simulated while the platform is live (B6).
 * Rule: `stopReason` is set exactly when `state` is `stopped`; `nextPollOn` only when `active`.
 */
export const PublicationPollingViewSchema = z
  .object({
    state: z.enum(['active', 'stopped', 'not-polled']),
    lastPolledOn: IsoDateSchema.nullable(),
    nextPollOn: IsoDateSchema.nullable(),
    stopReason: PollStopReasonSchema.nullable(),
  })
  .strict()
  .superRefine((polling, context) => {
    if ((polling.state === 'stopped') !== (polling.stopReason !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['stopReason'], message: 'stopReason is set exactly when state is stopped' });
    }
    if (polling.state !== 'active' && polling.nextPollOn !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextPollOn'], message: 'nextPollOn is set only while active' });
    }
  });
export type PublicationPollingView = z.infer<typeof PublicationPollingViewSchema>;

/**
 * `POST /runs/:runId/publications` (201): the stored row. Rev 7 adds `origin`, `attemptId` (the
 * studio attempt that created it, AC 49) and `polling`. A rev 7 api always sets them; they are
 * optional so a rev 6 body still parses, and a reader treats an absent `origin` as `manual`, an
 * absent `attemptId` as null and an absent `polling` as unknown.
 */
export const PublicationViewSchema = PublicationSchema.extend({
  origin: PublicationOriginSchema.optional(),
  attemptId: PublishAttemptIdSchema.nullable().optional(),
  polling: PublicationPollingViewSchema.nullable().optional(),
});
export type PublicationView = z.infer<typeof PublicationViewSchema>;

/** `DELETE /runs/:runId/publications/:publicationId` (200); 409 `publication-has-metrics` when it has snapshots. */
export const RemovePublicationResponseSchema = z.object({ runId: RunIdSchema, publicationId: PublicationIdSchema }).strict();
export type RemovePublicationResponse = z.infer<typeof RemovePublicationResponseSchema>;

/**
 * `PUT /runs/:runId/publications/:publicationId/metrics/:asOfDate`: the manual form. Saved with
 * source `form`; the same `(publication, asOfDate)` key replaces the earlier form snapshot.
 * `asOfDate` in the future answers 422 `metrics-as-of-in-future`.
 */
export const SaveMetricSnapshotRequestSchema = PlatformMetricsSchema;
export type SaveMetricSnapshotRequest = z.infer<typeof SaveMetricSnapshotRequestSchema>;

/**
 * One stored snapshot. `engagementRate` is derived on read by the web with `engagementRate`. Rev 7
 * adds `origin` (SPEC 0007 sections 4.1 and 5.6): `form` for source `form`, `api` when the
 * snapshot's import has `origin = 'api'`, `csv-upload` otherwise. Optional so a rev 6 body still
 * parses; a reader derives an absent one from `source` (`form`, else `csv-upload`).
 * Rule: `origin` is `form` exactly when `source` is `form`.
 */
export const MetricSnapshotViewSchema = MetricSnapshotSchema.extend({
  origin: MetricSnapshotOriginSchema.optional(),
}).superRefine((snapshot, context) => {
  if (snapshot.origin !== undefined && (snapshot.origin === 'form') !== (snapshot.source === 'form')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['origin'], message: 'origin is form exactly when source is form' });
  }
});
export type MetricSnapshotView = z.infer<typeof MetricSnapshotViewSchema>;

/**
 * One publication on the run page: the snapshot in force (latest `asOfDate`, `form` over `csv` on a
 * tie), up to 20 older snapshots newest first, and whether its platform has a baseline. Without
 * one the web says "Sem efeito na nota até haver 5 vídeos com métricas em {plataforma}."
 */
export const RunPublicationEntryViewSchema = z
  .object({
    publication: PublicationViewSchema,
    inForce: MetricSnapshotViewSchema.nullable(),
    history: z.array(MetricSnapshotViewSchema).max(METRIC_HISTORY_SHOWN),
    baselineReady: z.boolean(),
  })
  .strict();
export type RunPublicationEntryView = z.infer<typeof RunPublicationEntryViewSchema>;

/** `GET /runs/:runId/publications` (200). */
export const RunPublicationsViewSchema = z
  .object({
    runId: RunIdSchema,
    publications: z.array(RunPublicationEntryViewSchema).max(metricsBounds.maxPublicationsPerRun),
  })
  .strict();
export type RunPublicationsView = z.infer<typeof RunPublicationsViewSchema>;

/**
 * `POST /metrics/imports` multipart text fields; the third part is `file` (CSV text, at most
 * 2 MiB). The part's file name and content type are ignored.
 */
export const MetricImportFieldsSchema = z
  .object({
    platform: PlatformSchema,
    asOfDate: IsoDateSchema,
  })
  .strict();
export type MetricImportFields = z.infer<typeof MetricImportFieldsSchema>;

/** `POST /metrics/imports?dryRun=true|false`; absent means a real import. A dry run writes nothing. */
export const MetricImportQuerySchema = z
  .object({
    dryRun: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export type MetricImportQuery = z.input<typeof MetricImportQuerySchema>;

/**
 * `POST /metrics/imports` (200). Ids only, never cells: `unmatched` lists platform video ids with
 * no recorded publication (max 50), `issues` the skipped rows by line number (max 50).
 * `importId` is null on a dry run and when nothing was created or updated by a repeated file.
 */
export const MetricImportReportSchema = z
  .object({
    importId: MetricImportIdSchema.nullable(),
    dryRun: z.boolean(),
    platform: PlatformSchema,
    asOfDate: IsoDateSchema,
    rows: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    unmatched: z
      .array(z.object({ platformVideoId: z.string().max(40) }).strict())
      .max(metricsBounds.maxUnmatchedShown),
    unmatchedTotal: z.number().int().nonnegative(),
    issues: z
      .array(z.object({ line: z.number().int().min(1), issue: MetricRowIssueSchema }).strict())
      .max(metricsBounds.maxIssuesShown),
    issuesTotal: z.number().int().nonnegative(),
    ignoredColumns: z.number().int().nonnegative(),
    duplicateFile: z.boolean(),
    scoreRecomputed: z.boolean(),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.dryRun && report.importId !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['importId'], message: 'a dry run has no importId' });
    }
    report.unmatched.forEach((entry, index) => {
      if (!platformVideoIdPatterns[report.platform].test(entry.platformVideoId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unmatched', index, 'platformVideoId'],
          message: 'unmatched ids are platform video ids only',
        });
      }
    });
  });
export type MetricImportReport = z.infer<typeof MetricImportReportSchema>;

/**
 * The `ApiError.reason` for each import refusal, so the api and the CLI answer the same: the
 * encoding and shape refusals all read `metrics-not-csv`; a header with no named column reads as
 * the expected columns missing.
 */
export const metricImportRefusalReasons: Readonly<Record<MetricImportRefusedReason, ApiRev5ErrorReason>> = Object.freeze({
  'file-too-large': 'metrics-file-too-large',
  'not-utf8': 'metrics-not-csv',
  'not-csv': 'metrics-not-csv',
  'too-many-rows': 'metrics-too-many-rows',
  'too-many-columns': 'metrics-not-csv',
  'header-missing': 'metrics-required-column-missing',
  'required-column-missing': 'metrics-required-column-missing',
  'as-of-in-future': 'metrics-as-of-in-future',
  'empty-file': 'metrics-empty-file',
});
