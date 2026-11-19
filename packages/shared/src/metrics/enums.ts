import { z } from 'zod';

/** The three platforms of R3 (OD3): one parser profile each, one shared outcome shape. */
export const PlatformSchema = z.enum(['youtube', 'instagram', 'tiktok']);
export type Platform = z.infer<typeof PlatformSchema>;

/** How a snapshot arrived (OD2): a CSV upload or the manual form on the run page. */
export const MetricSourceSchema = z.enum(['csv', 'form']);
export type MetricSource = z.infer<typeof MetricSourceSchema>;

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
