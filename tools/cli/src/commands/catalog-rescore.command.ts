import { ExitCode } from '../errors/exit-codes.js';
import { formatDuration } from '../output/format.js';
import { withCliContext } from '../nest/cli-context.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * `studio catalog rescore` (SPEC 0003 section 5.1, R2-AC-03): recomputes every quality score from
 * the recorded review outcomes, through the single writer `QualityScoreService` (trigger `cli`).
 * A repair command: only versions whose value changed are written, so a run right after a review
 * reports 0 changed. Counts only; no rating, review note or reviewer name is printed or logged.
 * It promotes nothing, saves no learning and starts no comparison (B19).
 */
export async function catalogRescoreCommand(dependencies: CommandDependencies): Promise<number> {
  const summary = await withCliContext((context) => context.qualityScores.rescore());
  const { printer } = dependencies;
  printer.line(`Notas de qualidade recalculadas (fórmula v${summary.formulaVersion}, ${formatDuration(summary.durationMs)}):`);
  printer.line(`  resultados de revisão lidos: ${summary.outcomesRead}`);
  printer.line(`  versões com nota: ${summary.versionsScored}`);
  printer.line(`  versões alteradas: ${summary.versionsChanged} (das quais ${summary.versionsCleared} ficaram sem nota)`);
  if (summary.versionsChanged === 0) printer.line('Nenhum valor mudou.');
  return ExitCode.ok;
}
