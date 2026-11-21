import { type RunId } from '@studio/shared/run-format';
import { countCurationQueue, failedBeforeAnyCall, scanCurations } from '../curations/curation-reader.js';
import { curationFailureWindowStart } from '../doctor/curation-checks.js';
import { ExitCode } from '../errors/exit-codes.js';
import { toErrorReport } from '../errors/error-report.js';
import { withCliContext } from '../nest/cli-context.js';
import { runDetailLines, runListLines } from '../output/run-text.js';
import { nestPlatformGateway } from '../platforms/nest-platform-gateway.js';
import { printLeftTheMachine, printPlatformStatus } from '../platforms/platform-status.js';
import { listRecentRuns, readRunSnapshot, type RunSnapshot } from '../runs/run-reader.js';
import { isSettled, settleRuns } from '../runs/run-settlement.js';
import { nestScheduleGateway } from '../schedules/nest-schedule-gateway.js';
import { printScheduleStatus } from '../schedules/schedule-status.js';
import { type CommandDependencies } from './command-dependencies.js';

/** Runs listed by `studio status` without an id (rules/backend.md pagination default). */
export const STATUS_LIST_LIMIT = 20;

/**
 * Indexes what the files already show as settled (SPEC 0002 rev 2: "after a run is seen terminal
 * in status"). Status is a read; a database problem here is a warning, never a failed status.
 */
async function settleShown(snapshots: readonly RunSnapshot[], dependencies: CommandDependencies): Promise<void> {
  const settled = snapshots.filter(isSettled).map((snapshot) => ({ runId: snapshot.runId, runDir: snapshot.runDir }));
  if (settled.length === 0) return;
  try {
    const report = await withCliContext((context) => settleRuns(context, settled));
    if (report.failures.length > 0) {
      dependencies.printer.error(`Aviso: ${report.failures.length} execução(ões) não puderam ser indexadas; veja "studio doctor".`);
    }
  } catch (error) {
    dependencies.printer.error(`Aviso: custos e índice não atualizados. ${toErrorReport(error).message}`);
  }
}

/**
 * The curation queue (SPEC 0005 C5-07) and recent curations that failed before any model call,
 * counts only: no curation text is printed and nothing is written or indexed here. A folder that cannot be read is a warning; status never fails on it.
 */
async function printCurationQueue(dependencies: CommandDependencies): Promise<void> {
  try {
    const scan = await scanCurations(dependencies.settings.dataHome.curations);
    const counts = countCurationQueue(scan);
    dependencies.printer.line(`Curadorias: ${counts.queued} na fila, ${counts.inProgress} em andamento`);
    const failed = failedBeforeAnyCall(scan, curationFailureWindowStart(new Date())).length;
    if (failed > 0) {
      dependencies.printer.error(`Aviso: ${failed} curadoria(s) falhou(aram) antes de chamar o modelo; veja "studio doctor".`);
    }
    if (scan.unreadable.length > 0) {
      dependencies.printer.error(`Aviso: ${scan.unreadable.length} curadoria(s) ilegível(is); veja "studio doctor".`);
    }
  } catch (error) {
    dependencies.printer.error(`Aviso: curadorias não lidas. ${toErrorReport(error).message}`);
  }
}

/**
 * `studio status [runId]`: reads run folders directly through C5 (no api needed). Without an id it
 * lists the newest runs, the curation queue line, the schedules line (active count, next slot,
 * missed in 7 days; SPEC 0006 section 5.7, read through the core schedule queries) and one line
 * per platform with its status words (SPEC 0007 section 5.3, AC 43). With one (also
 * `studio runs show <runId>`) it shows stages, the waiting reason, live activity, "O que saiu da
 * máquina" and the run's publish attempts (SPEC 0007 section 5.4, AC 49), after
 * `PublishAttemptSync` for that run.
 */
export async function statusCommand(runId: RunId | undefined, dependencies: CommandDependencies): Promise<number> {
  const runsRoot = dependencies.settings.dataHome.runs;
  const describeError = (error: unknown): string => toErrorReport(error).message;
  if (runId !== undefined) {
    const snapshot = await readRunSnapshot(runsRoot, runId);
    for (const line of runDetailLines(snapshot)) dependencies.printer.line(line);
    await printLeftTheMachine({ gateway: nestPlatformGateway, printer: dependencies.printer, describeError, runId, runDir: snapshot.runDir });
    await settleShown([snapshot], dependencies);
    return ExitCode.ok;
  }
  const recent = await listRecentRuns(runsRoot, STATUS_LIST_LIMIT);
  for (const line of runListLines(recent)) dependencies.printer.line(line);
  await printCurationQueue(dependencies);
  await printScheduleStatus({ gateway: nestScheduleGateway, printer: dependencies.printer, describeError });
  await printPlatformStatus({ gateway: nestPlatformGateway, printer: dependencies.printer, describeError, now: () => new Date() });
  const snapshots = recent.results.flatMap((result) => (result.status === 'read' ? [result.snapshot] : []));
  await settleShown(snapshots, dependencies);
  return ExitCode.ok;
}
