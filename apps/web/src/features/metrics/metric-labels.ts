import { platformSignalRules, type MetricRowIssue, type MetricSource, type Platform } from '@studio/shared/metrics';

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

export const metricSourceLabels: Readonly<Record<MetricSource, string>> = {
  csv: 'CSV',
  form: 'Formulário',
};

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
