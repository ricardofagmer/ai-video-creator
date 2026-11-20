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
import { formatBytes } from '../output/format.js';

const importRefusals: Readonly<Record<MetricImportRefusedReason, string>> = {
  'file-too-large': `o arquivo passa de ${formatBytes(metricsBounds.maxFileBytes)}`,
  'not-utf8': 'o arquivo não está em UTF-8; exporte de novo como CSV UTF-8',
  'not-csv': 'o arquivo não é um CSV (zip, planilha e binários são recusados)',
  'too-many-rows': `o arquivo passa de ${metricsBounds.maxRows.toLocaleString('pt-BR')} linhas; exporte um período menor`,
  'too-many-columns': `o arquivo passa de ${metricsBounds.maxColumns} colunas`,
  'header-missing': 'o arquivo não tem a linha de cabeçalho',
  'required-column-missing': 'falta uma coluna obrigatória desta plataforma (id do vídeo ou visualizações)',
  'as-of-in-future': 'a data de --as-of está no futuro; use hoje ou um dia anterior',
  'empty-file': 'o arquivo está vazio',
};

/**
 * pt-BR text for the schedule and metrics domain errors (SPEC 0006 R3-07). Ids, platforms, dates,
 * counts and reason ids only: never a file name, a cell, a URL, a title or brief text (K7).
 * Returns null for an error this table does not know.
 */
export function describeOutsideSignalError(error: unknown): string | null {
  if (error instanceof ScheduleNotFoundError) return `Agendamento ${error.scheduleId} não encontrado; veja "studio schedules list".`;
  if (error instanceof ScheduleNotEditableError) return `O agendamento ${error.scheduleId} foi excluído e não muda mais.`;
  if (error instanceof ScheduleFileCorruptError) {
    return `Os arquivos do agendamento ${error.scheduleId} não conferem com o contrato; veja "studio doctor".`;
  }
  if (error instanceof InvalidScheduleInputError || error instanceof InvalidMetricsInputError) {
    return `Dados inválidos em: ${error.issues.map((issue) => issue.path || '<raiz>').join(', ')}.`;
  }
  if (error instanceof MetricImportRefusedError) return `Importação recusada (${error.platform}): ${importRefusals[error.refusal]}. Nada foi gravado.`;
  if (error instanceof MetricsAsOfInFutureError) return `A data ${error.asOfDate} está no futuro; use hoje ou um dia anterior.`;
  return null;
}
