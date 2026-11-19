import { SeedCatalogCommand, type SeedEntryResult, type SeedReport } from '@studio/core/seed';
import { ExitCode } from '../errors/exit-codes.js';
import { withCliContext } from '../nest/cli-context.js';
import { type CommandDependencies } from './command-dependencies.js';

const targetLabels: Readonly<Record<SeedEntryResult['target'], string>> = { asset: 'asset', recipe: 'receita' };
const folderLabels: Readonly<Record<SeedReport['optionalFolders']['recipes'], string>> = {
  absent: 'ausente',
  empty: 'vazia',
  loaded: 'carregada',
};

/** Seed report lines carry entry ids, refs and path-free failure codes only (seed-report.ts). */
function entryLine(entry: SeedEntryResult): string {
  const target = targetLabels[entry.target];
  switch (entry.outcome) {
    case 'created':
      return `  criado      ${target} ${entry.ref}  (${entry.entryId})`;
    case 'unchanged':
      return `  sem mudança ${target} ${entry.ref}  (${entry.entryId})`;
    case 'failed':
      return `  falhou      ${target} ${entry.entryId}: ${entry.failure.code} - ${entry.failure.message}`;
  }
}

/**
 * `studio catalog seed [--source-root <path>]` (R1-07, PRD 5.5): runs core `SeedCatalogCommand`
 * (idempotent; an entry already present with the same hash is `unchanged`) and prints the report
 * per entry. Exit 7 when some entries failed, so the install script (R1-22) can tell.
 */
export async function catalogSeedCommand(sourceRoot: string | undefined, dependencies: CommandDependencies): Promise<number> {
  const report = await withCliContext((context) =>
    context.commandBus.execute(new SeedCatalogCommand({ sourceRoot, signal: dependencies.signal })),
  );
  const { printer } = dependencies;
  printer.line('Seed do catálogo:');
  for (const entry of report.entries) printer.line(entryLine(entry));
  printer.line(
    `Pastas opcionais: receitas ${folderLabels[report.optionalFolders.recipes]}, prompts ${folderLabels[report.optionalFolders.prompts]}.`,
  );
  const { created, unchanged, failed } = report.counts;
  printer.line(`Total: ${created} criados, ${unchanged} sem mudança, ${failed} com falha.`);
  return failed > 0 ? ExitCode.partial : ExitCode.ok;
}
