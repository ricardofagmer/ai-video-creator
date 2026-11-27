import type { MetricRowIssue } from '@studio/shared/metrics';
import type { Messages } from '../message-types.js';

/** `studio metrics import|sync` and the human text of `studio insights` (the `--json` output is not translated). */
export const metricsPtBR = {
  /** The option name in the input-file messages ("O arquivo de métricas ..."). */
  fileOption: 'métricas',
  issues: {
    'id-missing': 'sem id do vídeo',
    'id-invalid': 'id do vídeo não reconhecido',
    'number-invalid': 'número inválido',
    'date-invalid': 'data inválida',
    'cell-too-long': 'célula longa demais',
    'duplicate-row': 'vídeo repetido no arquivo (vale a primeira linha)',
    'views-missing': 'sem visualizações',
  } satisfies Record<MetricRowIssue, string>,
  import: {
    scope: (platform: string, date: string) => `${platform}, dia ${date}`,
    dryRun: (scope: string) => `Simulação da importação de métricas (${scope}): nada foi gravado.`,
    nothingNew: (scope: string) => `Importação de métricas (${scope}): nada novo para gravar.`,
    recorded: (importId: string, scope: string) => `Importação de métricas ${importId} gravada (${scope}).`,
    counts: (rows: number, matched: number, created: number, updated: number, unchanged: number) =>
      `Linhas: ${rows} · ligadas a uma execução: ${matched} · novas: ${created} · atualizadas: ${updated} · iguais: ${unchanged}`,
    leftovers: (unmatched: number, skipped: number, ignored: number) =>
      `Sem execução ligada: ${unmatched} · linhas puladas: ${skipped} · colunas ignoradas: ${ignored}`,
    duplicateFile: 'Este arquivo já foi importado para este dia; só linhas novas ou alteradas contam.',
    skippedHeading: 'Linhas puladas:',
    skippedLine: (line: number, issue: string) => `  linha ${line}: ${issue}`,
    andMore: (count: number) => `  ... e mais ${count}.`,
    unmatchedHeading: 'Vídeos sem execução ligada: registre a publicação na página da execução e importe de novo.',
    scoresRecomputed: 'Notas de qualidade recalculadas.',
  },
  sync: {
    summary: (ingested: number, duplicates: number, refused: number) =>
      `Métricas coletadas pelo watcher: ${ingested} ${ingested === 1 ? 'lote gravado' : 'lotes gravados'}, ` +
      `${duplicates} ${duplicates === 1 ? 'repetido descartado' : 'repetidos descartados'}, ${refused} ${refused === 1 ? 'recusado' : 'recusados'}.`,
    nothingNew: 'Nenhum lote novo na caixa de entrada.',
    refused: (count: number) => `Aviso: ${count} lote(s) não confere(m) com o contrato e ficou(aram) na caixa de entrada; veja os logs.`,
  },
  insights: {
    noData: 'sem dados',
    unavailable: 'indisponível',
    underAMinute: 'menos de 1 min',
    onTarget: 'na meta',
    offTarget: 'fora da meta',
    reviewReach: (share: string, withoutRepair: number, reached: number, target: string, verdict: string) =>
      `Revisão sem reparo manual: ${share} (${withoutRepair} de ${reached}) · meta ${target} · ${verdict}`,
    withoutHistory: (count: number) => `  ${count} sem histórico legível ficaram de fora`,
    reviewTimeNone: 'Tempo do briefing à revisão: nenhuma execução chegou à revisão ainda',
    reviewTimeHeading: 'Tempo do briefing à revisão (primeira -> mais recente):',
    reviewTimeLine: (recipeId: string, first: string, latest: string, runs: number, verdict: string) =>
      `  ${recipeId}: ${first} -> ${latest} (${runs} execuções) · ${verdict}`,
    catalog: (meeting: number, fromTarget: number, fromRun: number, share: string, verdict: string) =>
      `Ativos do catálogo: ${meeting} de ${fromTarget} execuções a partir da ${fromRun}ª com ${share} ou mais · ${verdict}`,
    catalogRun: (ordinal: number, runId: string, fromCatalog: number, assetVersions: number, share: string) =>
      `  nº ${ordinal} ${runId}: ${fromCatalog} de ${assetVersions} (${share})`,
    withoutManifest: (count: number) => `  ${count} sem manifesto ficaram de fora`,
    costPerApproved: (cost: string, approved: number, total: string) => `Custo por vídeo aprovado: ${cost} (${approved} aprovados, ${total} no total)`,
    costLimits: (runLimit: string, over: number, month: string, monthLimit: string) =>
      `  limite por execução ${runLimit}: ${over} acima · mês atual ${month} de ${monthLimit}`,
    ratingNone: 'Tendência de nota: nenhuma execução avaliada ainda',
    ratingHeading: 'Tendência de nota (últimas 5 contra as 5 anteriores):',
    ratingLine: (recipeId: string, latest: string, previous: string, verdict: string) => `  ${recipeId}: ${latest} contra ${previous} · ${verdict}`,
    headline: (runs: number, truncatedTo: number | null) =>
      `Indicadores de ${runs} execuções que chegaram à revisão${truncatedTo === null ? '' : ` (só as ${truncatedTo} mais recentes)`}.`,
    unapproved: (count: number, verdict: string) => `Publicados sem aprovação: ${count} · meta nenhum · ${verdict}`,
  },
} as const;

export type MetricsMessages = Messages<typeof metricsPtBR>;

export const metricsEs: MetricsMessages = {
  fileOption: 'métricas',
  issues: {
    'id-missing': 'sin id del video',
    'id-invalid': 'id del video no reconocido',
    'number-invalid': 'número no válido',
    'date-invalid': 'fecha no válida',
    'cell-too-long': 'celda demasiado larga',
    'duplicate-row': 'video repetido en el archivo (vale la primera fila)',
    'views-missing': 'sin visualizaciones',
  },
  import: {
    scope: (platform, date) => `${platform}, día ${date}`,
    dryRun: (scope) => `Simulación de la importación de métricas (${scope}): no se guardó nada.`,
    nothingNew: (scope) => `Importación de métricas (${scope}): nada nuevo para guardar.`,
    recorded: (importId, scope) => `Importación de métricas ${importId} guardada (${scope}).`,
    counts: (rows, matched, created, updated, unchanged) =>
      `Filas: ${rows} · vinculadas a una ejecución: ${matched} · nuevas: ${created} · actualizadas: ${updated} · iguales: ${unchanged}`,
    leftovers: (unmatched, skipped, ignored) => `Sin ejecución vinculada: ${unmatched} · filas omitidas: ${skipped} · columnas ignoradas: ${ignored}`,
    duplicateFile: 'Este archivo ya se importó para este día; solo cuentan las filas nuevas o modificadas.',
    skippedHeading: 'Filas omitidas:',
    skippedLine: (line, issue) => `  fila ${line}: ${issue}`,
    andMore: (count) => `  ... y ${count} más.`,
    unmatchedHeading: 'Videos sin ejecución vinculada: registra la publicación en la página de la ejecución e importa de nuevo.',
    scoresRecomputed: 'Notas de calidad recalculadas.',
  },
  sync: {
    summary: (ingested, duplicates, refused) =>
      `Métricas recolectadas por el watcher: ${ingested} ${ingested === 1 ? 'lote guardado' : 'lotes guardados'}, ` +
      `${duplicates} ${duplicates === 1 ? 'repetido descartado' : 'repetidos descartados'}, ${refused} ${refused === 1 ? 'rechazado' : 'rechazados'}.`,
    nothingNew: 'Ningún lote nuevo en la bandeja de entrada.',
    refused: (count) =>
      count === 1
        ? 'Aviso: 1 lote no coincide con el contrato y quedó en la bandeja de entrada; revisa los logs.'
        : `Aviso: ${count} lotes no coinciden con el contrato y quedaron en la bandeja de entrada; revisa los logs.`,
  },
  insights: {
    noData: 'sin datos',
    unavailable: 'no disponible',
    underAMinute: 'menos de 1 min',
    onTarget: 'en la meta',
    offTarget: 'fuera de la meta',
    reviewReach: (share, withoutRepair, reached, target, verdict) =>
      `Revisión sin reparo manual: ${share} (${withoutRepair} de ${reached}) · meta ${target} · ${verdict}`,
    withoutHistory: (count) => `  ${count} sin historial legible quedaron fuera`,
    reviewTimeNone: 'Tiempo del briefing a la revisión: ninguna ejecución llegó a la revisión todavía',
    reviewTimeHeading: 'Tiempo del briefing a la revisión (primera -> más reciente):',
    reviewTimeLine: (recipeId, first, latest, runs, verdict) => `  ${recipeId}: ${first} -> ${latest} (${runs} ejecuciones) · ${verdict}`,
    catalog: (meeting, fromTarget, fromRun, share, verdict) =>
      `Activos del catálogo: ${meeting} de ${fromTarget} ejecuciones a partir de la ${fromRun}.ª con ${share} o más · ${verdict}`,
    catalogRun: (ordinal, runId, fromCatalog, assetVersions, share) => `  n.º ${ordinal} ${runId}: ${fromCatalog} de ${assetVersions} (${share})`,
    withoutManifest: (count) => `  ${count} sin manifiesto quedaron fuera`,
    costPerApproved: (cost, approved, total) => `Costo por video aprobado: ${cost} (${approved} aprobados, ${total} en total)`,
    costLimits: (runLimit, over, month, monthLimit) => `  límite por ejecución ${runLimit}: ${over} por encima · mes actual ${month} de ${monthLimit}`,
    ratingNone: 'Tendencia de nota: ninguna ejecución evaluada todavía',
    ratingHeading: 'Tendencia de nota (últimas 5 frente a las 5 anteriores):',
    ratingLine: (recipeId, latest, previous, verdict) => `  ${recipeId}: ${latest} frente a ${previous} · ${verdict}`,
    headline: (runs, truncatedTo) =>
      `Indicadores de ${runs} ejecuciones que llegaron a la revisión${truncatedTo === null ? '' : ` (solo las ${truncatedTo} más recientes)`}.`,
    unapproved: (count, verdict) => `Publicados sin aprobación: ${count} · meta ninguno · ${verdict}`,
  },
};

export const metricsEn: MetricsMessages = {
  fileOption: 'metrics',
  issues: {
    'id-missing': 'no video id',
    'id-invalid': 'video id not recognized',
    'number-invalid': 'invalid number',
    'date-invalid': 'invalid date',
    'cell-too-long': 'cell too long',
    'duplicate-row': 'video repeated in the file (the first row counts)',
    'views-missing': 'no views',
  },
  import: {
    scope: (platform, date) => `${platform}, day ${date}`,
    dryRun: (scope) => `Metrics import simulation (${scope}): nothing was recorded.`,
    nothingNew: (scope) => `Metrics import (${scope}): nothing new to record.`,
    recorded: (importId, scope) => `Metrics import ${importId} recorded (${scope}).`,
    counts: (rows, matched, created, updated, unchanged) =>
      `Rows: ${rows} · linked to a run: ${matched} · new: ${created} · updated: ${updated} · unchanged: ${unchanged}`,
    leftovers: (unmatched, skipped, ignored) => `No linked run: ${unmatched} · rows skipped: ${skipped} · columns ignored: ${ignored}`,
    duplicateFile: 'This file was already imported for this day; only new or changed rows count.',
    skippedHeading: 'Rows skipped:',
    skippedLine: (line, issue) => `  row ${line}: ${issue}`,
    andMore: (count) => `  ... and ${count} more.`,
    unmatchedHeading: "Videos with no linked run: record the publication on the run's page and import again.",
    scoresRecomputed: 'Quality scores recomputed.',
  },
  sync: {
    summary: (ingested, duplicates, refused) =>
      `Metrics collected by the watcher: ${ingested} ${ingested === 1 ? 'batch recorded' : 'batches recorded'}, ` +
      `${duplicates} ${duplicates === 1 ? 'duplicate dropped' : 'duplicates dropped'}, ${refused} refused.`,
    nothingNew: 'No new batch in the inbox.',
    refused: (count) =>
      count === 1
        ? 'Warning: 1 batch does not match the contract and stayed in the inbox; see the logs.'
        : `Warning: ${count} batches do not match the contract and stayed in the inbox; see the logs.`,
  },
  insights: {
    noData: 'no data',
    unavailable: 'unavailable',
    underAMinute: 'under 1 min',
    onTarget: 'on target',
    offTarget: 'off target',
    reviewReach: (share, withoutRepair, reached, target, verdict) =>
      `Review without manual repair: ${share} (${withoutRepair} of ${reached}) · target ${target} · ${verdict}`,
    withoutHistory: (count) => `  ${count} without a readable history were left out`,
    reviewTimeNone: 'Time from brief to review: no run has reached review yet',
    reviewTimeHeading: 'Time from brief to review (first -> latest):',
    reviewTimeLine: (recipeId, first, latest, runs, verdict) => `  ${recipeId}: ${first} -> ${latest} (${runs} runs) · ${verdict}`,
    catalog: (meeting, fromTarget, fromRun, share, verdict) =>
      `Catalog assets: ${meeting} of ${fromTarget} runs from run ${fromRun} on with ${share} or more · ${verdict}`,
    catalogRun: (ordinal, runId, fromCatalog, assetVersions, share) => `  #${ordinal} ${runId}: ${fromCatalog} of ${assetVersions} (${share})`,
    withoutManifest: (count) => `  ${count} without a manifest were left out`,
    costPerApproved: (cost, approved, total) => `Cost per approved video: ${cost} (${approved} approved, ${total} in total)`,
    costLimits: (runLimit, over, month, monthLimit) => `  per-run cap ${runLimit}: ${over} over · this month ${month} of ${monthLimit}`,
    ratingNone: 'Rating trend: no run rated yet',
    ratingHeading: 'Rating trend (latest 5 against the 5 before):',
    ratingLine: (recipeId, latest, previous, verdict) => `  ${recipeId}: ${latest} against ${previous} · ${verdict}`,
    headline: (runs, truncatedTo) => `Insights from ${runs} runs that reached review${truncatedTo === null ? '' : ` (only the ${truncatedTo} most recent)`}.`,
    unapproved: (count, verdict) => `Published without approval: ${count} · target none · ${verdict}`,
  },
};
