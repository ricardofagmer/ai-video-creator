import { GetSearchIndexStatusQuery, type EmbedScope, type SearchIndexStatus } from '@studio/core/embeddings';
import { indexCheck, modelCheck } from '../doctor/search-checks.js';
import { checkLine } from '../doctor/doctor-check.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { readManifestState } from '../models/model-manifest.js';
import { withSearchContext } from '../nest/cli-context.js';
import { formatDuration } from '../output/format.js';
import { type CommandDependencies } from './command-dependencies.js';

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
  const { summary, status } = await withSearchContext(settings, async (context) => {
    const result = await context.embeddingIndexer.sync(scope);
    const after: SearchIndexStatus = await context.queryBus.execute(new GetSearchIndexStatusQuery());
    return { summary: result, status: after };
  });
  const text = cliText().doctor.embed;
  if (summary.outcome === 'model-unavailable') {
    printer.line(checkLine(modelCheck(status, manifest)));
    printer.line(text.nothingIndexed);
    return ExitCode.dependency;
  }
  printer.line(text.heading(text.scopes[scope], summary.modelRef ?? text.unknownModel, formatDuration(summary.durationMs)));
  printer.line(text.embedded(summary.embedded));
  if (summary.failed > 0) printer.line(text.failed(summary.failed));
  printer.line(checkLine(indexCheck(status)));
  return summary.failed > 0 ? ExitCode.partial : ExitCode.ok;
}
