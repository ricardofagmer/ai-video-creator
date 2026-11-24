import { SeedCatalogCommand, type SeedEntryResult, type SeedReport } from '@studio/core/seed';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { withCliContext } from '../nest/cli-context.js';
import { type CommandDependencies } from './command-dependencies.js';

function folderLabel(state: SeedReport['optionalFolders']['recipes']): string {
  return cliText().commands.seed.folders[state];
}

/** Seed report lines carry entry ids, refs and path-free failure codes only (seed-report.ts). */
function entryLine(entry: SeedEntryResult): string {
  const text = cliText().commands.seed;
  const target = text.targets[entry.target];
  switch (entry.outcome) {
    case 'created':
      return text.created(target, entry.ref, entry.entryId);
    case 'unchanged':
      return text.unchanged(target, entry.ref, entry.entryId);
    case 'failed':
      return text.failed(target, entry.entryId, entry.failure.code, entry.failure.message);
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
  const text = cliText().commands.seed;
  printer.line(text.heading);
  for (const entry of report.entries) printer.line(entryLine(entry));
  printer.line(text.optionalFolders(folderLabel(report.optionalFolders.recipes), folderLabel(report.optionalFolders.prompts)));
  const { created, unchanged, failed } = report.counts;
  printer.line(text.total(created, unchanged, failed));
  return failed > 0 ? ExitCode.partial : ExitCode.ok;
}
