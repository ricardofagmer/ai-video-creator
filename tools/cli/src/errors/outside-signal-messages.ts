import {
  InvalidMetricsInputError,
  MetricImportRefusedError,
  MetricsAsOfInFutureError,
} from '@studio/core/metrics';
import {
  InvalidScheduleInputError,
  ScheduleFileCorruptError,
  ScheduleNotEditableError,
  ScheduleNotFoundError,
} from '@studio/core/schedules';
import { metricsBounds, type MetricImportRefusedReason } from '@studio/shared/metrics';
import { cliText } from '../i18n/messages.js';
import { formatBytes, formatInteger } from '../output/format.js';

function importRefusalText(reason: MetricImportRefusedReason): string {
  const text: (bounds: { size: string; rows: string; columns: number }) => string = cliText().errors.outsideSignal.importRefusals[reason];
  return text({ size: formatBytes(metricsBounds.maxFileBytes), rows: formatInteger(metricsBounds.maxRows), columns: metricsBounds.maxColumns });
}

/**
 * Text for the schedule and metrics domain errors (SPEC 0006 R3-07). Ids, platforms, dates,
 * counts and reason ids only: never a file name, a cell, a URL, a title or brief text (K7).
 * Returns null for an error this table does not know.
 */
export function describeOutsideSignalError(error: unknown): string | null {
  const { errors } = cliText();
  const text = errors.outsideSignal;
  if (error instanceof ScheduleNotFoundError) return text.scheduleNotFound(error.scheduleId);
  if (error instanceof ScheduleNotEditableError) return text.scheduleNotEditable(error.scheduleId);
  if (error instanceof ScheduleFileCorruptError) return text.scheduleFileCorrupt(error.scheduleId);
  if (error instanceof InvalidScheduleInputError || error instanceof InvalidMetricsInputError) {
    return text.invalidDataIn(error.issues.map((issue) => issue.path || errors.domain.root).join(', '));
  }
  if (error instanceof MetricImportRefusedError) return text.importRefused(error.platform, importRefusalText(error.refusal));
  if (error instanceof MetricsAsOfInFutureError) return text.asOfInFuture(error.asOfDate);
  return null;
}
