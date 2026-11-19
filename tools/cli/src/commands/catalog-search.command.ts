import { SemanticSearchQuery, type SemanticSearchHit } from '@studio/core/embeddings';
import { formatAssetRef } from '@studio/shared/catalog';
import { ExitCode } from '../errors/exit-codes.js';
import { withSearchContext } from '../nest/cli-context.js';
import { fitText } from '../output/format.js';
import { type CommandDependencies } from './command-dependencies.js';

export interface SemanticSearchOptions {
  /** NFC-normalized and trimmed at the boundary, 1 to 500 characters. */
  query: string;
  /** 1 to 20. */
  limit: number;
}

const REF_WIDTH = 32;
const KIND_WIDTH = 10;
const NAME_WIDTH = 40;

function hitLine(hit: SemanticSearchHit, position: number): string {
  const { version } = hit;
  const ref = formatAssetRef({ assetId: version.id, version: version.version });
  return `${String(position).padStart(2)}. ${hit.similarity.toFixed(3)}  ${fitText(ref, REF_WIDTH)} ${fitText(version.kind, KIND_WIDTH)} ${fitText(version.name, NAME_WIDTH)}`;
}

/**
 * `studio catalog search --semantic "<text>" [--limit <n>]` (SPEC 0003 section 5.2): the same
 * `SemanticSearchQuery` handler as `POST /catalog/search`, embedded with the local model, top
 * `limit` by similarity with no threshold (B10), biometric versions excluded (the default). The
 * query text is printed nowhere and logged nowhere: core logs its length only (section 6). A model
 * that is not ready throws `EmbeddingUnavailableError` (exit 5) at the command boundary.
 */
export async function catalogSearchCommand(options: SemanticSearchOptions, dependencies: CommandDependencies): Promise<number> {
  const result = await withSearchContext((context) =>
    context.queryBus.execute(new SemanticSearchQuery({ query: options.query, limit: options.limit })),
  );
  const { printer } = dependencies;
  if (result.items.length === 0) {
    printer.line('Nenhuma versão indexada para comparar.');
  } else {
    printer.line(`Busca por significado (${result.modelRef}), ${result.items.length} resultado(s), do mais parecido ao menos:`);
    result.items.forEach((hit, index) => printer.line(hitLine(hit, index + 1)));
  }
  printer.line(`Comparadas: ${result.scanned}. Pendentes (sem vetor do modelo atual): ${result.pending}.`);
  if (result.pending > 0) printer.line('Para incluir as pendentes, rode "studio catalog embed".');
  return ExitCode.ok;
}
