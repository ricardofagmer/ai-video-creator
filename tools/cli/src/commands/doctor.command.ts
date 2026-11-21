import { sandboxExecExists } from '@studio/hyperframes';
import { ExitCode } from '../errors/exit-codes.js';
import { hyperframesChecks, readHyperframesStatus } from '../hyperframes/hyperframes-status.js';
import { toErrorReport } from '../errors/error-report.js';
import { checkCurations } from '../doctor/curation-checks.js';
import { scheduleChecks } from '../doctor/schedule-checks.js';
import { checkCostIndex, checkDatabase, checkReferences, checkStoreSize, rebuildRunIndex } from '../doctor/data-checks.js';
import { checkLine, hasFailure, type DoctorCheck } from '../doctor/doctor-check.js';
import { INDEX_CHECK_LABEL, MODEL_CHECK_LABEL, checkSearch } from '../doctor/search-checks.js';
import { checkApi, checkTool, checkWatcher, checkWeb } from '../doctor/service-checks.js';
import { platformChecks, publishAttemptCheck } from '../doctor/platform-checks.js';
import { withSearchContext, type CliContext, type CliSearchContext } from '../nest/cli-context.js';
import { readPlatforms, syncAllAttempts } from '../platforms/nest-platform-gateway.js';
import { scanSchedules } from '../schedules/schedule-scan.js';
import { type CommandDependencies } from './command-dependencies.js';

export interface DoctorOptions {
  rebuildIndex: boolean;
}

interface DoctorSection {
  check: DoctorCheck;
  /** Indented detail lines printed under the check (unreachable references). */
  lines: string[];
}

/**
 * One check that throws becomes a failed line with the error's pt-BR message, so a single broken
 * dependency never hides the rest of the report.
 */
async function guarded(label: string, run: () => Promise<DoctorSection>, signal: AbortSignal): Promise<DoctorSection> {
  try {
    return await run();
  } catch (error) {
    if (signal.aborted) throw error;
    return { check: { label, status: 'failed', detail: toErrorReport(error).message }, lines: [] };
  }
}

function only(check: DoctorCheck): DoctorSection {
  return { check, lines: [] };
}

/**
 * The model and index lines of SPEC 0003 section 7. An absent, unpinned or rejected model is a
 * warning, never a failure (B7, R2-AC-27); only an error reading the index (the database) fails,
 * and then the model line says it was not checked rather than inventing a state.
 */
async function searchSections(context: CliSearchContext, dependencies: CommandDependencies): Promise<DoctorSection[]> {
  try {
    const checks = await checkSearch(context, dependencies.settings);
    return [only(checks.model), only(checks.index)];
  } catch (error) {
    if (dependencies.signal.aborted) throw error;
    const detail = toErrorReport(error).message;
    return [
      only({ label: MODEL_CHECK_LABEL, status: 'warning', detail: `não verificado: ${detail}` }),
      only({ label: INDEX_CHECK_LABEL, status: 'failed', detail }),
    ];
  }
}

/**
 * SPEC 0007 section 5.9: the publish attempts after `PublishAttemptSync` (the same reconcile the
 * api runs before its reads), then one line per platform with the web's status words. An
 * unreadable platform file fails `doctor`; a platform waiting on the owner is a warning.
 */
async function platformSections(context: CliContext, signal: AbortSignal): Promise<DoctorSection[]> {
  const sections = [await guarded('envios às plataformas', async () => only(publishAttemptCheck(await syncAllAttempts(context))), signal)];
  try {
    sections.push(...platformChecks(await readPlatforms(context), new Date()).map(only));
  } catch (error) {
    if (signal.aborted) throw error;
    sections.push(only({ label: 'plataformas', status: 'failed', detail: toErrorReport(error).message }));
  }
  return sections;
}

/**
 * SPEC 0008 section 7: the same lines as `studio hyperframes status`. HyperFrames is opt-in, so an
 * unreadable state is a warning, never a failure of `doctor`.
 */
async function hyperframesSections(dependencies: CommandDependencies): Promise<DoctorSection[]> {
  try {
    const status = await readHyperframesStatus(dependencies.settings, { now: new Date(), sandboxAvailable: sandboxExecExists() });
    return hyperframesChecks(status).map(only);
  } catch (error) {
    if (dependencies.signal.aborted) throw error;
    return [only({ label: 'HyperFrames', status: 'warning', detail: `não verificado: ${toErrorReport(error).message}` })];
  }
}

/** Database-backed checks share one booted context; a boot failure marks the database failed. */
async function dataSections(options: DoctorOptions, dependencies: CommandDependencies): Promise<DoctorSection[]> {
  const { signal } = dependencies;
  try {
    return await withSearchContext(async (context) => {
      const sections = [await guarded('banco de dados', async () => only(await checkDatabase(context)), signal)];
      sections.push(await guarded('armazenamento', async () => only(await checkStoreSize(context, signal)), signal));
      sections.push(await guarded('referências', () => checkReferences(context, signal), signal));
      if (options.rebuildIndex) sections.push(await guarded('reconstrução do índice', async () => only(await rebuildRunIndex(context)), signal));
      sections.push(await guarded('custos e índice', async () => only(await checkCostIndex(context, signal)), signal));
      sections.push(...(await platformSections(context, signal)));
      sections.push(...(await searchSections(context, dependencies)));
      return sections;
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return [only({ label: 'banco de dados', status: 'failed', detail: toErrorReport(error).message })];
  }
}

/**
 * `studio doctor [--rebuild-index]`: web, api, watcher, ffmpeg/ffprobe, database, store size and
 * unreachable references, curations that failed before any model call, schedule files, fired run
 * folders and active schedules without a running watcher (SPEC 0006 section 5.7), then cost
 * indexing of settled runs (SPEC 0002 rev 2), then the publish attempts and one line per platform
 * (SPEC 0007 section 5.9), then the search model and index lines (SPEC 0003 section 7). Read-only
 * apart from the index tables (cost_entries, run index), stale pid records and the
 * `PublishAttemptSync` reconcile of `publication_attempts`; it never downloads the model nor embeds,
 * and it makes no platform call. Exit 6 when any check
 * fails; the search model lines are at most warnings, so a missing model never fails it (R2-AC-27).
 */
export async function doctorCommand(options: DoctorOptions, dependencies: CommandDependencies): Promise<number> {
  const { settings, signal } = dependencies;
  const sections: DoctorSection[] = [];
  sections.push(await guarded('web', async () => only(await checkWeb(settings)), signal));
  sections.push(await guarded('api', async () => only(await checkApi(settings)), signal));
  const watcher = await guarded('watcher', async () => only(await checkWatcher(settings)), signal);
  sections.push(watcher);
  sections.push(await guarded('ffmpeg', async () => only(await checkTool('ffmpeg', settings)), signal));
  sections.push(await guarded('ffprobe', async () => only(await checkTool('ffprobe', settings)), signal));
  sections.push(await guarded('curadorias', () => checkCurations(settings.dataHome.curations, { now: new Date(), signal }), signal));
  // The watcher line is `ok` exactly when the launchd agent has a running process.
  const watcherRunning = watcher.check.status === 'ok';
  const scheduleRoots = { schedulesRoot: settings.dataHome.schedules, runsRoot: settings.dataHome.runs };
  sections.push(await guarded('agendamentos', async () => scheduleChecks(await scanSchedules(scheduleRoots, signal), watcherRunning), signal));
  sections.push(...(await hyperframesSections(dependencies)));
  sections.push(...(await dataSections(options, dependencies)));

  dependencies.printer.line(`Diagnóstico do studio (dados em ${settings.dataHome.root})`);
  for (const section of sections) {
    dependencies.printer.line(checkLine(section.check));
    for (const line of section.lines) dependencies.printer.line(line);
  }
  if (settings.keyVariablesSet.length > 0) {
    // Names only, never values: a set variable takes priority over the Keychain entry (see `secrets set`).
    dependencies.printer.line(`[aviso] chaves vindas de variáveis de ambiente: ${settings.keyVariablesSet.join(', ')}.`);
  }
  const checks = sections.map((section) => section.check);
  if (hasFailure(checks)) {
    dependencies.printer.line('Resultado: há falhas.');
    return ExitCode.unhealthy;
  }
  dependencies.printer.line('Resultado: tudo certo.');
  return ExitCode.ok;
}
