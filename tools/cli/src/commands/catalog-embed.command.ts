import { GetSearchIndexStatusQuery, type EmbedScope, type SearchIndexStatus } from '@studio/core/embeddings';
import { indexCheck, modelCheck } from '../doctor/search-checks.js';
import { checkLine } from '../doctor/doctor-check.js';
import { ExitCode } from '../errors/exit-codes.js';
import { readManifestState } from '../models/model-manifest.js';
import { withSearchContext } from '../nest/cli-context.js';
import { formatDuration } from '../output/format.js';
import { type CommandDependencies } from './command-dependencies.js';

const scopeTexts: Readonly<Record<EmbedScope, string>> = {
  unindexed: 'versões não indexadas',
  stale: 'versões com vetor de outro modelo (--stale)',
  all: 'todas as versões (--all)',
};

/**
 * `studio catalog embed [--stale | --all]` (SPEC 0003 section 5.2, R2-AC-09): awaits one
 * `EmbeddingIndexer.sync(scope)` pass, the single writer of the embedding columns, on the local
 * model only (batches of 8, B9). Prints counts and the index state afterwards; no document text,
 * vector or path. Exit 5 when the model is not ready (nothing was written, rows stay pending),
 * exit 7 when some rows could not be turned into a document (they stay pending), else 0.
 */
export async function catalogEmbedCommand(scope: EmbedScope, dependencies: CommandDependencies): Promise<number> {
  const { printer, settings } = dependencies;
  const manifest = await readManifestState(settings);
  const { summary, status } = await withSearchContext(async (context) => {
    const result = await context.embeddingIndexer.sync(scope);
    const after: SearchIndexStatus = await context.queryBus.execute(new GetSearchIndexStatusQuery());
    return { summary: result, status: after };
  });
  if (summary.outcome === 'model-unavailable') {
    printer.line(checkLine(modelCheck(status, manifest)));
    printer.line('Nada foi indexado; as versões continuam pendentes e a busca por palavras segue funcionando.');
    return ExitCode.dependency;
  }
  printer.line(`Indexação (${scopeTexts[scope]}) com ${summary.modelRef ?? 'modelo desconhecido'} em ${formatDuration(summary.durationMs)}:`);
  printer.line(`  versões indexadas agora: ${summary.embedded}`);
  if (summary.failed > 0) printer.line(`  versões sem documento (continuam pendentes; veja logs/cli.log): ${summary.failed}`);
  printer.line(checkLine(indexCheck(status)));
  return summary.failed > 0 ? ExitCode.partial : ExitCode.ok;
}
