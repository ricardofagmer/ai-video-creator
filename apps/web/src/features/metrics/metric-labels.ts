import { type PublicationPollingView } from '@studio/shared/api';
import {
  platformSignalRules,
  type MetricRowIssue,
  type MetricSnapshotOrigin,
  type MetricSource,
  type Platform,
  type PublicationOrigin,
} from '@studio/shared/metrics';
import { pollRules, type PollStopReason } from '@studio/shared/platforms';

/*
 * pt-BR texts of the metrics screens (SPEC 0006 section 5.9). Every value shown with them is a
 * text node: URLs, ids and numbers are never rendered as markup.
 */

export const platformLabels: Readonly<Record<Platform, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const platformOrder: readonly Platform[] = ['youtube', 'instagram', 'tiktok'];

const metricSourceLabels: Readonly<Record<MetricSource, string>> = {
  csv: 'CSV',
  form: 'Formulário',
};

/** Rev 7 (SPEC 0007 section 4.1): how a snapshot arrived; a pulled one keeps source `csv` and shows `api`. */
const metricSnapshotOriginLabels: Readonly<Record<MetricSnapshotOrigin, string>> = {
  form: 'Formulário',
  'csv-upload': 'CSV',
  api: 'API da plataforma',
};

/** The "Origem" cell of one snapshot; a rev 6 body without `origin` reads it from `source`. */
export function snapshotOriginLabel(snapshot: { source: MetricSource; origin?: MetricSnapshotOrigin }): string {
  return snapshot.origin === undefined ? metricSourceLabels[snapshot.source] : metricSnapshotOriginLabels[snapshot.origin];
}

/** Rev 7 (SPEC 0007 sections 4.1 and 5.9): where a publication came from; `mock` is the "simulado" badge. */
export const publicationOriginLabels: Readonly<Record<PublicationOrigin, string>> = {
  manual: 'Link colado',
  studio: 'Publicado pelo estúdio',
  mock: 'simulado',
};

const pollStopTexts: Readonly<Record<PollStopReason, string>> = {
  'window-closed': `Coleta encerrada: ${pollRules.stopAfterDay} dias`,
  'not-found': 'Coleta encerrada: vídeo não encontrado na plataforma',
  'not-owned': 'Coleta encerrada: o vídeo não é da conta conectada',
  'publication-removed': 'Coleta encerrada: publicação removida',
};

/** `yyyy-mm-dd` one day after `isoDate`, by calendar arithmetic in UTC so no time zone moves it. */
function nextIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : new Date(date.getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * SPEC 0007 section 5.9, the polling line of a publication: "Próxima coleta: amanhã" while active,
 * "Coleta encerrada: 180 dias" once stopped. `todayIso` is the Mac's local date, injected.
 */
export function pollingLineText(polling: PublicationPollingView, todayIso: string): string {
  if (polling.state === 'stopped') return polling.stopReason === null ? 'Coleta encerrada' : pollStopTexts[polling.stopReason];
  if (polling.state === 'not-polled') return 'Sem coleta automática: registre as métricas pelo formulário ou por CSV.';
  const next = polling.nextPollOn;
  if (next === null || next <= todayIso) return 'Próxima coleta: hoje';
  if (next === nextIsoDate(todayIso)) return 'Próxima coleta: amanhã';
  return `Próxima coleta: ${formatIsoDate(next)}`;
}

/** Why an import row was skipped, completing "Linha N: ...". */
export const metricRowIssueTexts: Readonly<Record<MetricRowIssue, string>> = {
  'id-missing': 'sem o id ou o link do vídeo',
  'id-invalid': 'id ou link do vídeo não reconhecido',
  'number-invalid': 'um número não pôde ser lido',
  'date-invalid': 'uma data não pôde ser lida',
  'cell-too-long': 'uma célula passa de 2.000 caracteres',
  'duplicate-row': 'vídeo repetido no arquivo; valeu a primeira linha',
  'views-missing': 'sem o número de visualizações',
};

/** SPEC 0006 section 5.3, beside the unmatched ids of an import report. */
export const UNMATCHED_TEXT = 'Vídeos sem execução ligada: registre a publicação na página da execução e importe de novo.';

/** SPEC 0006 section 5.4: a platform with fewer than 5 eligible videos does not move the score yet. */
export function baselineMissingText(platform: Platform): string {
  return `Sem efeito na nota até haver ${platformSignalRules.baselineMinVideos} vídeos com métricas em ${platformLabels[platform]}.`;
}

/**
 * How to get each export, as plain text (SPEC 0006 sections 5.3 and 5.9). Column names are still
 * provisional (Q7), so the steps name screens, not columns. No login is ever asked for here.
 */
export const exportInstructions: Readonly<Record<Platform, string>> = {
  youtube:
    'No YouTube Studio, abra Análises, entre no Modo avançado e use "Exportar visualização atual" no nível de vídeo. Se o download vier em .zip, abra-o e envie só o arquivo Table data.csv. Relatórios baixados têm no máximo 500 linhas.',
  instagram:
    'No Meta Business Suite, abra Insights, depois Conteúdo, e exporte os dados em CSV. A exportação leva alguns minutos para ficar pronta. O arquivo precisa trazer o link de cada post.',
  tiktok:
    'No TikTok Studio, pelo navegador, abra Análises e baixe os dados dos vídeos. O download cobre os últimos 60 dias. Se vier como planilha .xlsx, salve como CSV (UTF-8) antes de enviar.',
};

export const NO_CREDENTIALS_TEXT =
  'O estúdio nunca pede login, senha ou chave das plataformas: exporte no site da própria plataforma e envie o arquivo aqui.';

const countFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const rateFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

const NO_VALUE = '—';

/** "4.000"; a dash when the platform did not report it. */
export function formatCount(value: number | null): string {
  return value === null ? NO_VALUE : countFormatter.format(value);
}

/** "45,2%" for `averageViewPercent`, which is already in percent. */
export function formatPercentValue(value: number | null): string {
  return value === null ? NO_VALUE : `${decimalFormatter.format(value)}%`;
}

/** "6,3%" for a ratio such as `engagementRate`. */
export function formatRate(value: number | null): string {
  return value === null ? NO_VALUE : rateFormatter.format(value);
}

/** "19/11/2026" from a C10 `yyyy-mm-dd`, by text, so no time zone can move the day. */
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year === undefined || month === undefined || day === undefined ? isoDate : `${day}/${month}/${year}`;
}

/** Today in the Mac's local calendar as `yyyy-mm-dd`: the default and the maximum of an `asOfDate`. */
export function localTodayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
