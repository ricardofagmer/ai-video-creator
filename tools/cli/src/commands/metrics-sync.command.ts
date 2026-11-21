import { type MetricBatchIngestSummary } from '@studio/core/metrics';
import { ExitCode } from '../errors/exit-codes.js';
import { type PlatformGateway } from '../platforms/platform-gateway.js';
import { type CommandDependencies } from './command-dependencies.js';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Counts only: no video id, no metric value, no file name (SPEC 0007 K7). */
export function metricSyncLines(summary: MetricBatchIngestSummary): string[] {
  const lines = [
    `Métricas coletadas pelo watcher: ${plural(summary.ingested, 'lote gravado', 'lotes gravados')}, ` +
      `${plural(summary.duplicates, 'repetido descartado', 'repetidos descartados')}, ${plural(summary.refused, 'recusado', 'recusados')}.`,
  ];
  if (summary.ingested === 0 && summary.duplicates === 0 && summary.refused === 0) lines.push('Nenhum lote novo na caixa de entrada.');
  if (summary.scoreRecomputed) lines.push('Notas de qualidade recalculadas.');
  return lines;
}

/**
 * `studio metrics sync` (SPEC 0007 section 5.6): runs `IngestMetricBatch` over every batch file the
 * watcher dropped, through the R3 import pipeline, as the api does before its reads. A refused file
 * stays in place and is logged by core with its batch id; the command exits 7 (partial) then.
 */
export async function metricsSyncCommand(gateway: PlatformGateway, dependencies: CommandDependencies): Promise<number> {
  const summary = await gateway.syncMetrics();
  for (const line of metricSyncLines(summary)) dependencies.printer.line(line);
  if (summary.refused > 0) {
    dependencies.printer.error(`Aviso: ${summary.refused} lote(s) não confere(m) com o contrato e ficou(aram) na caixa de entrada; veja os logs.`);
    return ExitCode.partial;
  }
  return ExitCode.ok;
}
