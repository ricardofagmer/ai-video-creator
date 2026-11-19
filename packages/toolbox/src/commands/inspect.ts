import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runFiles, stageStates, type RunFile } from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { InputError, isErrnoException } from '../errors';
import { totalCostUsd } from '../run/costs';
import { nextStepFor } from '../run/next-steps';
import { mockNarrationAudioFile } from '../run/run-paths';
import { fileExists, readRun } from '../run/run-store';
import { applyEvent } from '../run/state';

async function presentFiles(runDir: string): Promise<string[]> {
  const candidates = [...Object.entries(runFiles).filter(([key]) => key !== 'run').map(([, name]) => name), mockNarrationAudioFile];
  const present: string[] = [];
  for (const name of candidates) if (await fileExists(join(runDir, name))) present.push(name);
  return present;
}

/** Prints state, reason, costs, files present and the next step (report on stdout). */
export async function statusCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  const lines = [
    `run:      ${run.runId} (${run.template}, ${run.pillar}, slot ${run.slot})`,
    `state:    ${run.state}${run.failedStage ? ` (failed stage: ${run.failedStage})` : ''}`,
    `reason:   ${run.stateReason ?? '-'}`,
    `costs:    ${totalCostUsd(run).toFixed(4)} USD estimated (${run.costs.length} rows)`,
    `files:    ${(await presentFiles(runDir)).join(', ') || '-'}`,
    `approval: ${run.approval ? `${run.approval.decision} by ${run.approval.reviewer} at ${run.approval.decidedAt}` : '-'}`,
    `next:     ${nextStepFor(run)}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  return { runId: run.runId, state: run.state, next: nextStepFor(run) };
}

/** One line per run under ACE_RUNS_DIR (report on stdout). */
export async function listCommand(context: CommandContext): Promise<CommandOutcome> {
  let entries: string[];
  try {
    entries = (await readdir(context.env.runsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') entries = [];
    else throw error;
  }
  const rows: string[] = [];
  for (const name of entries.sort()) {
    const runDir = join(context.env.runsDir, name);
    if (!(await fileExists(join(runDir, runFiles.run)))) continue;
    try {
      const run: RunFile = await readRun(runDir);
      rows.push(`${run.runId}\t${run.state}\t${totalCostUsd(run).toFixed(4)} USD\t${run.stateReason ?? ''}`);
    } catch (error) {
      rows.push(`${name}\tINVALID\t-\t${error instanceof Error ? error.message : String(error)}`);
    }
  }
  process.stdout.write(rows.length > 0 ? `${rows.join('\n')}\n` : `no runs in ${context.env.runsDir}\n`);
  return { runId: null, state: null, next: rows.length > 0 ? 'run ace status <runId> for details' : 'run ace init to start a run' };
}

/** FAILED -> the state the failed stage runs in, so the stage can be re-run. */
export async function retryCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  if (run.state !== 'FAILED') throw new InputError(`retry needs a FAILED run (run is ${run.state})`, nextStepFor(run));
  if (!run.failedStage) throw new InputError('run is FAILED but records no failed stage; inspect run.json');
  const resumeState = stageStates[run.failedStage].runningIn;
  const resumed = applyEvent(run, {
    event: { type: 'RETRY_REQUESTED' },
    actor: 'toolbox',
    reason: `retry ${run.failedStage}`,
    resumeState,
  });
  const saved = await context.commit(runDir, resumed);
  context.log(`run resumed in ${saved.state}; re-run the ${run.failedStage} stage`);
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
