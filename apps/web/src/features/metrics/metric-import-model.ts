import { metricsBounds, type Platform } from '@studio/shared/metrics';
import { ApiRequestError } from '@/lib/api';
import { apiReasonText, describeApiError } from '@/features/common/api-error-text';
import { platformLabels } from './metric-labels';

/*
 * Browser-side helpers of `/metricas/importar` (SPEC 0006 section 5.3). The file checks here are a
 * convenience that spares an upload; the api decodes, bounds and parses the file and is the
 * boundary. The file is never read or rendered by the web.
 */

const CSV_NAME = /\.csv$/i;

/** A pt-BR reason to refuse the chosen file before sending it, or null when it may be sent. */
export function localFileProblem(file: File): string | null {
  if (file.size > metricsBounds.maxFileBytes) return apiReasonText('metrics-file-too-large');
  if (file.size === 0) return apiReasonText('metrics-empty-file');
  if (!CSV_NAME.test(file.name)) return apiReasonText('metrics-not-csv');
  return null;
}

/**
 * pt-BR text for a failed import: the column refusal names the chosen platform (section 4.4 text),
 * and a 413 from the web proxy reads as the 2 MB limit, not as a catalog upload limit.
 */
export function metricImportErrorText(error: unknown, platform: Platform): string {
  if (error instanceof ApiRequestError) {
    if (error.reason === 'metrics-required-column-missing') {
      return `Não encontrei as colunas esperadas da exportação de ${platformLabels[platform]}. Confira se escolheu a plataforma certa.`;
    }
    if (error.status === 413) return apiReasonText('metrics-file-too-large');
  }
  return describeApiError(error);
}
