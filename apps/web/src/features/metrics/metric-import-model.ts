import { metricsBounds, type Platform } from '@studio/shared/metrics';
import { ApiRequestError } from '@/lib/api';
import { type WebMessages } from '@/messages';
import { apiReasonText, describeApiError } from '@/features/common/api-error-text';
import { platformLabels } from './metric-labels';

/*
 * Browser-side helpers of `/metricas/importar` (SPEC 0006 section 5.3). The file checks here are a
 * convenience that spares an upload; the api decodes, bounds and parses the file and is the
 * boundary. The file is never read or rendered by the web.
 */

const CSV_NAME = /\.csv$/i;

/** A reason, in the active language, to refuse the chosen file before sending it, or null when it may be sent. */
export function localFileProblem(file: File, t: WebMessages): string | null {
  if (file.size > metricsBounds.maxFileBytes) return apiReasonText('metrics-file-too-large', t);
  if (file.size === 0) return apiReasonText('metrics-empty-file', t);
  if (!CSV_NAME.test(file.name)) return apiReasonText('metrics-not-csv', t);
  return null;
}

/**
 * The text for a failed import: the column refusal names the chosen platform (section 4.4 text),
 * and a 413 from the web proxy reads as the 2 MB limit, not as a catalog upload limit.
 */
export function metricImportErrorText(error: unknown, platform: Platform, t: WebMessages): string {
  if (error instanceof ApiRequestError) {
    if (error.reason === 'metrics-required-column-missing') {
      return t.metrics.import.errors.columnsMissing(platformLabels[platform]);
    }
    if (error.status === 413) return apiReasonText('metrics-file-too-large', t);
  }
  return describeApiError(error, t);
}
