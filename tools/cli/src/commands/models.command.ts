import { verifyModelDirectory, type ModelIntegrityResult } from '@studio/core/embeddings';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { checkLine, type DoctorCheck } from '../doctor/doctor-check.js';
import { checkSearch, modelCheckLabel } from '../doctor/search-checks.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { runModelFetch, type ModelFetchOutcome } from '../models/model-fetch.js';
import { manifestText, readManifestState } from '../models/model-manifest.js';
import { withSearchContext } from '../nest/cli-context.js';
import { type Printer } from '../output/printer.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { type CommandDependencies } from './command-dependencies.js';

/**
 * `studio models status`: the manifest, then the model and index lines `studio doctor` prints
 * (SPEC 0003 section 7). Informational: exit 0 whatever the model state; a database that cannot
 * be read is thrown to the command boundary.
 */
export async function modelsStatusCommand(dependencies: CommandDependencies): Promise<number> {
  const { printer, settings } = dependencies;
  printer.line(cliText().doctor.models.manifest(manifestText(await readManifestState(settings))));
  const checks = await withSearchContext(settings, (context) => checkSearch(context, settings));
  printer.line(checkLine(checks.model));
  printer.line(checkLine(checks.index));
  return ExitCode.ok;
}

/** Re-hashes the pinned files; read-only, no database, no runtime, no network. */
async function verifyPinned(manifest: EmbeddingModelManifest, settings: CliSettings): Promise<ModelIntegrityResult> {
  return verifyModelDirectory(settings.dataHome.embeddingModelDirectory(manifest.modelRef), manifest);
}

function integrityCheck(result: ModelIntegrityResult, modelRef: string): DoctorCheck {
  const text = cliText().doctor.models;
  const label = modelCheckLabel();
  switch (result.status) {
    case 'verified':
      return { label, status: 'ok', detail: text.verified(modelRef) };
    case 'absent':
      return { label, status: 'warning', detail: text.absent(modelRef) };
    case 'rejected': {
      // The manifest-relative file name only, never a path (SPEC 0003 section 6).
      const file = result.file === null ? text.modelFolder : result.file;
      return { label, status: 'failed', detail: text.rejected(modelRef, file, text.rejections[result.reason]) };
    }
  }
}

const integrityExitCodes: Readonly<Record<ModelIntegrityResult['status'], number>> = {
  verified: ExitCode.ok,
  absent: ExitCode.dependency,
  rejected: ExitCode.unhealthy,
};

function printIntegrity(result: ModelIntegrityResult, modelRef: string, printer: Printer): number {
  printer.line(checkLine(integrityCheck(result, modelRef)));
  return integrityExitCodes[result.status];
}

/**
 * `studio models verify` (SPEC 0003 Q6): re-hashes every pinned file in the data home against the
 * committed manifest, the same check core runs before the first inference. Read-only. Exit 0
 * verified; 5 absent, provisional or unusable manifest; 6 rejected (a file differs).
 */
export async function modelsVerifyCommand(dependencies: CommandDependencies): Promise<number> {
  const { printer, settings } = dependencies;
  const state = await readManifestState(settings);
  printer.line(cliText().doctor.models.manifest(manifestText(state)));
  if (state.status !== 'pinned') return ExitCode.dependency;
  return printIntegrity(await verifyPinned(state.manifest, settings), state.manifest.modelRef, printer);
}

function fetchWarning(outcome: Exclude<ModelFetchOutcome, { status: 'installed' }>): string {
  const text = cliText().doctor.models;
  switch (outcome.status) {
    case 'unpinned':
      return text.fetchUnpinned;
    case 'download-failed':
      return text.fetchFailed;
    case 'invalid-source':
      return text.fetchInvalidSource;
    case 'not-started':
      return text.fetchNotStarted;
    case 'other':
      return text.fetchOther(outcome.exitCode);
  }
}

/**
 * `studio models fetch` (SPEC 0003 section 5.2 step 4, B7): repeats install step 7, the CLI's only
 * network use. Every non-zero script outcome is reported as a warning, never thrown: unpinned
 * pins exit 0 (nothing to fetch yet, as the installer treats them); a failed or unconfirmed
 * download exits 5. After a successful script run the files are re-hashed once more here.
 */
export async function modelsFetchCommand(dependencies: CommandDependencies): Promise<number> {
  const { printer, settings, signal } = dependencies;
  const outcome = await runModelFetch(settings, printer, signal);
  if (outcome.status !== 'installed') {
    printer.line(`${cliText().doctor.warningPrefix} ${fetchWarning(outcome)}`);
    return outcome.status === 'unpinned' ? ExitCode.ok : ExitCode.dependency;
  }
  const state = await readManifestState(settings);
  if (state.status !== 'pinned') {
    printer.line(cliText().doctor.models.manifestChanged(manifestText(state)));
    return ExitCode.dependency;
  }
  return printIntegrity(await verifyPinned(state.manifest, settings), state.manifest.modelRef, printer);
}
