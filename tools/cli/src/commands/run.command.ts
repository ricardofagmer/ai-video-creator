import { CreateRunDraftCommand, CreateRunDraftInputSchema, InvalidRunInputError, MarkRunPendingCommand } from '@studio/core/runs';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { withCliContext } from '../nest/cli-context.js';
import { readJsonInputFile } from '../terminal/json-input-file.js';
import { type CommandDependencies } from './command-dependencies.js';

export interface RunCommandOptions {
  /** `recipeId@version` (C2 `RecipeRef`). */
  recipe: string;
  /** Path of a JSON file with the C2 `Brief`. */
  brief: string;
  /** Run-specific `assetId@version` references (PRD 6 step 2). */
  references: string[];
  title?: string;
}

/**
 * `studio run --recipe <ref> --brief <file.json>`: creates the `draft` run.json through core
 * `CreateRunDraftCommand` (`createdBy: cli`, no correlation id; RUN-FORMAT section 5), then moves it
 * to `pending` with `MarkRunPendingCommand`. The launchd watcher picks it up; the Planner runs and
 * the run waits at the plan gate (K2). No api is needed.
 */
export async function runCommand(options: RunCommandOptions, dependencies: CommandDependencies): Promise<number> {
  const brief = await readJsonInputFile('brief', options.brief);
  const parsed = CreateRunDraftInputSchema.safeParse({
    recipeRef: options.recipe,
    brief,
    references: options.references,
    title: options.title,
    createdBy: 'cli',
    correlationId: null,
  });
  if (!parsed.success) {
    throw new InvalidRunInputError(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  const input = parsed.data;
  const started = await withCliContext(async (context) => {
    const draft = await context.commandBus.execute(new CreateRunDraftCommand(input));
    return context.commandBus.execute(new MarkRunPendingCommand(draft.run.runId));
  });
  const { printer } = dependencies;
  const text = cliText().runs.created;
  printer.line(text.queued(started.run.runId, started.run.recipe.ref));
  printer.line(text.next);
  printer.line(`  studio status ${started.run.runId}`);
  printer.line(text.approveHint(started.run.runId));
  if (started.index === 'stale') printer.error(text.staleIndex);
  return ExitCode.ok;
}
