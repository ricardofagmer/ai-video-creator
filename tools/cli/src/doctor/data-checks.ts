import { RebuildRunIndexCommand } from '@studio/core/runs';
import { type RunId } from '@studio/shared/run-format';
import { scanCatalogVersions } from '../catalog/catalog-scan.js';
import { scanCurations, terminalCurationIds } from '../curations/curation-reader.js';
import { settleCurations } from '../curations/curation-settlement.js';
import { cliText } from '../i18n/messages.js';
import { type CliContext } from '../nest/cli-context.js';
import { formatBytes } from '../output/format.js';
import { listAllRunIds, readRunSnapshot } from '../runs/run-reader.js';
import { isSettled, settleRuns, type SettlementTarget } from '../runs/run-settlement.js';
import { type CheckStatus, type DoctorCheck } from './doctor-check.js';
import { findUnreachableReferences, measureStore } from './storage-checks.js';

/** Unreachable references listed one per line before the rest is summarised. */
const MAX_LISTED_REFERENCES = 20;

export async function checkDatabase(context: CliContext): Promise<DoctorCheck> {
  // A constant tagged template: Prisma sends it as a prepared statement with no parameters.
  await context.prisma.$queryRaw`SELECT 1`;
  const text = cliText().doctor;
  return { label: text.labels.database, status: 'ok', detail: text.data.databaseOk(context.dataHome.databaseFile) };
}

export async function checkStoreSize(context: CliContext, signal: AbortSignal): Promise<DoctorCheck> {
  const usage = await measureStore(context.dataHome.assets, signal);
  const text = cliText().doctor;
  const size = text.data.storageSize(formatBytes(usage.bytes), usage.files);
  if (usage.truncated) return { label: text.labels.storage, status: 'warning', detail: text.data.storageTruncated(size) };
  return { label: text.labels.storage, status: 'ok', detail: `${size}.` };
}

/** Paths of non-biometric references are shown so the owner can find them; biometric ones never. */
export async function checkReferences(context: CliContext, signal: AbortSignal): Promise<{ check: DoctorCheck; lines: string[] }> {
  const versions = await scanCatalogVersions(context.queryBus, signal);
  const unreachable = await findUnreachableReferences(versions, signal);
  const text = cliText().doctor;
  const label = text.labels.references;
  if (unreachable.length === 0) return { check: { label, status: 'ok', detail: text.data.referencesOk }, lines: [] };
  const lines = unreachable
    .slice(0, MAX_LISTED_REFERENCES)
    .map((reference) => `        ${reference.ref}: ${reference.path ?? text.data.biometricReference}`);
  if (unreachable.length > MAX_LISTED_REFERENCES) lines.push(text.data.andMore(unreachable.length - MAX_LISTED_REFERENCES));
  return { check: { label, status: 'warning', detail: text.data.unreachable(unreachable.length) }, lines };
}

/**
 * Indexes cost.json and run.json of every settled run folder (SPEC 0002 rev 2: "at least in
 * doctor"), then cost.json of every terminal curation (SPEC 0005 B16). Idempotent; a run a watcher
 * still owns or a curation not terminal yet is skipped and indexed on a later pass. Only ids and
 * counts are reported, never curation text.
 */
export async function checkCostIndex(context: CliContext, signal: AbortSignal): Promise<DoctorCheck> {
  const targets: SettlementTarget[] = [];
  const unreadable: RunId[] = [];
  for (const runId of await listAllRunIds(context.dataHome.runs)) {
    signal.throwIfAborted();
    try {
      const snapshot = await readRunSnapshot(context.dataHome.runs, runId);
      if (isSettled(snapshot)) targets.push({ runId, runDir: snapshot.runDir });
    } catch (error) {
      if (signal.aborted) throw error;
      // Reported in the check below by run id; one broken run folder does not stop the others.
      unreadable.push(runId);
    }
  }
  const report = await settleRuns(context, targets);
  const curationScan = await scanCurations(context.dataHome.curations, signal);
  const curationReport = await settleCurations(context, terminalCurationIds(curationScan));
  const text = cliText().doctor;
  const label = text.labels.costIndex;
  const inserted = report.insertedCostEntries + curationReport.insertedCostEntries;
  const summary = text.data.costSummary(report.runs, curationReport.curations, inserted);
  const problemIds: string[] = [
    ...report.failures.map((failure) => failure.runId),
    ...unreadable,
    ...curationReport.failures.map((failure) => failure.curationId),
    ...curationScan.unreadable,
  ];
  if (problemIds.length === 0) return { label, status: 'ok', detail: `${summary}.` };
  return { label, status: 'warning', detail: text.data.withProblems(summary, problemIds.length, problemIds.slice(0, 5).join(', ')) };
}

/** `doctor --rebuild-index`: the core rebuild (ADR 0003), files win; orphaned rows are only reported. */
export async function rebuildRunIndex(context: CliContext): Promise<DoctorCheck> {
  const report = await context.commandBus.execute(new RebuildRunIndexCommand());
  const text = cliText().doctor;
  const parts = [text.data.reindexed(report.indexed)];
  if (report.unreadable.length > 0) parts.push(text.data.unreadableFolders(report.unreadable.length));
  if (report.orphaned.length > 0) parts.push(text.data.orphanedRows(report.orphaned.length));
  const status: CheckStatus = report.unreadable.length > 0 || report.orphaned.length > 0 ? 'warning' : 'ok';
  return { label: text.labels.rebuild, status, detail: `${parts.join(', ')}.` };
}
