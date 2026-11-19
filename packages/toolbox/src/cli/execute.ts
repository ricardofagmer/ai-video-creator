import { BlockedError, IllegalTransitionError } from '@studio/shared/ace';
import type { ToolboxEnv } from '../config/env';
import { InputError } from '../errors';
import { nextStepFor } from '../run/next-steps';
import { applyEvent } from '../run/state';
import { CommandContext, type CommandOutcome } from './context';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_BLOCKED = 2;

interface FinalLine extends CommandOutcome {
  ok: boolean;
}

function printFinalLine(line: FinalLine): void {
  process.stdout.write(`${JSON.stringify({ ok: line.ok, runId: line.runId, state: line.state, next: line.next })}\n`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Records BLOCKED or FAILED for a started stage. Never throws: the original error wins. */
async function recordStageOutcome(context: CommandContext, error: unknown): Promise<void> {
  const active = context.active;
  const stage = context.stage;
  if (!active || !stage) return;
  try {
    const event =
      error instanceof BlockedError
        ? { type: 'STAGE_BLOCKED' as const, stage, reason: `${error.code}: ${error.message}` }
        : { type: 'STAGE_FAILED' as const, stage, reason: describe(error) };
    const run = applyEvent(active.run, { event, actor: 'toolbox', reason: event.reason });
    await context.commit(active.runDir, run);
  } catch (recordError) {
    context.log(`error: could not record ${stage} outcome in run.json: ${describe(recordError)}`);
  }
}

function outcomeFromContext(context: CommandContext, fallbackNext: string): CommandOutcome {
  const run = context.active?.run;
  return { runId: run?.runId ?? null, state: run?.state ?? null, next: fallbackNext };
}

/**
 * The single place where command errors are handled: maps them to exit codes,
 * records stage outcomes in run.json and always prints the final JSON line.
 */
export async function executeCommand(
  loadEnv: () => ToolboxEnv,
  handler: (context: CommandContext) => Promise<CommandOutcome>,
): Promise<void> {
  let env: ToolboxEnv;
  try {
    env = loadEnv();
  } catch (error) {
    printUsageFailure(describe(error));
    return;
  }
  const context = new CommandContext(env);
  try {
    const outcome = await handler(context);
    printFinalLine({ ok: true, ...outcome });
    process.exitCode = EXIT_OK;
    return;
  } catch (error) {
    if (error instanceof InputError || error instanceof IllegalTransitionError) {
      context.log(`error: ${error.message}`);
      const hint = error instanceof InputError ? error.next : undefined;
      const run = context.active?.run;
      printFinalLine({ ok: false, ...outcomeFromContext(context, hint ?? (run ? nextStepFor(run) : 'run ace --help')) });
      process.exitCode = EXIT_FAILED;
      return;
    }
    await recordStageOutcome(context, error);
    const run = context.active?.run;
    if (error instanceof BlockedError) {
      context.log(`blocked [${error.code}]: ${error.message}`);
      printFinalLine({ ok: false, ...outcomeFromContext(context, run ? nextStepFor(run) : 'start a new run with ace init') });
      process.exitCode = EXIT_BLOCKED;
      return;
    }
    context.log(`failed: ${describe(error)}`);
    printFinalLine({ ok: false, ...outcomeFromContext(context, run ? nextStepFor(run) : 'fix the error above and re-run') });
    process.exitCode = EXIT_FAILED;
  }
}

/** For commander's own parse errors (unknown command, missing option). */
export function printUsageFailure(message: string): void {
  process.stderr.write(`error: ${message}\n`);
  printFinalLine({ ok: false, runId: null, state: null, next: 'run ace --help' });
  process.exitCode = EXIT_FAILED;
}

export function printHelpDone(): void {
  printFinalLine({ ok: true, runId: null, state: null, next: 'run ace init to start a run, or ace list to see runs' });
  process.exitCode = EXIT_OK;
}
