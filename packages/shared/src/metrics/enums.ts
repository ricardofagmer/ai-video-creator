import { z } from 'zod';

/** The three platforms of R3 (OD3): one parser profile each, one shared outcome shape. */
export const PlatformSchema = z.enum(['youtube', 'instagram', 'tiktok']);
export type Platform = z.infer<typeof PlatformSchema>;

/** How a snapshot arrived (OD2): a CSV upload or the manual form on the run page. */
export const MetricSourceSchema = z.enum(['csv', 'form']);
export type MetricSource = z.infer<typeof MetricSourceSchema>;

/**
 * Where a publication came from (SPEC 0007 section 4.1, column `run_publications.origin`): a link the
 * owner pasted, a studio upload, or a simulated upload. Checked by zod in the handlers because an
 * added column carries no table CHECK (K8). Existing rows read `manual`.
 */
export const PublicationOriginSchema = z.enum(['manual', 'studio', 'mock']);
export type PublicationOrigin = z.infer<typeof PublicationOriginSchema>;

/**
 * How a `metric_imports` row arrived (SPEC 0007 section 4.5, column `metric_imports.origin`): a CSV
 * upload or a pulled API batch (Q3). Existing rows read `upload`.
 */
export const MetricImportOriginSchema = z.enum(['upload', 'api']);
export type MetricImportOrigin = z.infer<typeof MetricImportOriginSchema>;

/**
 * How a snapshot is shown (SPEC 0007 section 4.1): derived on read from `source` and the origin of
 * its import, never stored. A pulled snapshot keeps source `csv` (Q3) and shows `api`.
 */
export const MetricSnapshotOriginSchema = z.enum(['form', 'csv-upload', 'api']);
export type MetricSnapshotOrigin = z.infer<typeof MetricSnapshotOriginSchema>;

/** Why one CSV row was skipped; the import continues and reports the row by its line number. */
export const MetricRowIssueSchema = z.enum([
  'id-missing',
  'id-invalid',
  'number-invalid',
  'date-invalid',
  'cell-too-long',
  'duplicate-row',
  'views-missing',
]);
export type MetricRowIssue = z.infer<typeof MetricRowIssueSchema>;

/** Why a whole CSV import was refused before anything was written (SPEC 0006 section 5.3). */
export const MetricImportRefusedReasonSchema = z.enum([
  'file-too-large',
  'not-utf8',
  'not-csv',
  'too-many-rows',
  'too-many-columns',
  'header-missing',
  'required-column-missing',
  'as-of-in-future',
  'empty-file',
]);
export type MetricImportRefusedReason = z.infer<typeof MetricImportRefusedReasonSchema>;
