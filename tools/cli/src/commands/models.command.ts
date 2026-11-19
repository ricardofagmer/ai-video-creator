import { verifyModelDirectory, type ModelIntegrityResult, type ModelRejectionReason } from '@studio/core/embeddings';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { checkLine, type DoctorCheck } from '../doctor/doctor-check.js';
import { MODEL_CHECK_LABEL, checkSearch } from '../doctor/search-checks.js';
import { ExitCode } from '../errors/exit-codes.js';
import { runModelFetch, type ModelFetchOutcome } from '../models/model-fetch.js';
import { manifestText, readManifestState } from '../models/model-manifest.js';
import { withSearchContext } from '../nest/cli-context.js';
import { type Printer } from '../output/printer.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { type CommandDependencies } from './command-dependencies.js';

const rejectionTexts: Readonly<Record<ModelRejectionReason, string>> = {
  missing: 'falta o arquivo ou ele não é um arquivo comum dentro da pasta do modelo',
  size: 'o tamanho não confere com o manifesto',
  hash: 'o sha-256 não confere com o manifesto',
};

/**
 * `studio models status`: the manifest, then the model and index lines `studio doctor` prints
 * (SPEC 0003 section 7). Informational: exit 0 whatever the model state; a database that cannot
 * be read is thrown to the command boundary.
 */
export async function modelsStatusCommand(dependencies: CommandDependencies): Promise<number> {
  const { printer, settings } = dependencies;
  printer.line(`Manifesto: ${manifestText(await readManifestState(settings))}.`);
  const checks = await withSearchContext((context) => checkSearch(context, settings));
  printer.line(checkLine(checks.model));
  printer.line(checkLine(checks.index));
  return ExitCode.ok;
}

/** Re-hashes the pinned files; read-only, no database, no runtime, no network. */
async function verifyPinned(manifest: EmbeddingModelManifest, settings: CliSettings): Promise<ModelIntegrityResult> {
  return verifyModelDirectory(settings.dataHome.embeddingModelDirectory(manifest.modelRef), manifest);
}

function integrityCheck(result: ModelIntegrityResult, modelRef: string): DoctorCheck {
  switch (result.status) {
    case 'verified':
      return { label: MODEL_CHECK_LABEL, status: 'ok', detail: `${modelRef} confere com o manifesto (tamanho e sha-256 de cada arquivo).` };
    case 'absent':
      return {
        label: MODEL_CHECK_LABEL,
        status: 'warning',
        detail: `ausente (${modelRef}); rode "studio models fetch" ou coloque os arquivos à mão e verifique de novo.`,
      };
    case 'rejected': {
      // The manifest-relative file name only, never a path (SPEC 0003 section 6).
      const file = result.file === null ? 'a pasta do modelo' : result.file;
      return {
        label: MODEL_CHECK_LABEL,
        status: 'failed',
        detail: `recusado (${modelRef}): ${file}: ${rejectionTexts[result.reason]}. Nada é carregado nem baixado; "studio models fetch" substitui os arquivos que não conferem.`,
      };
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
  printer.line(`Manifesto: ${manifestText(state)}.`);
  if (state.status !== 'pinned') return ExitCode.dependency;
  return printIntegrity(await verifyPinned(state.manifest, settings), state.manifest.modelRef, printer);
}

function fetchWarning(outcome: Exclude<ModelFetchOutcome, { status: 'installed' }>): string {
  switch (outcome.status) {
    case 'unpinned':
      return 'o manifesto do modelo de busca ainda tem valores provisórios; nada foi baixado e a busca por significado fica indisponível. O resto do studio funciona.';
    case 'download-failed':
      return 'o modelo de busca não foi instalado (download, pasta ou conferência falhou); a busca por significado fica indisponível. Tente "studio models fetch" de novo quando a rede estiver disponível.';
    case 'invalid-source':
      return 'o manifesto ou a fonte do modelo em scripts/models não puderam ser validados (ou o @studio/shared não foi construído); nada foi baixado.';
    case 'not-started':
      return 'não foi possível executar /bin/bash para baixar o modelo; nada foi baixado.';
    case 'other':
      return `o script do modelo de busca saiu com código ${outcome.exitCode ?? 'desconhecido'}; nada foi confirmado.`;
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
    printer.line(`[aviso] ${fetchWarning(outcome)}`);
    return outcome.status === 'unpinned' ? ExitCode.ok : ExitCode.dependency;
  }
  const state = await readManifestState(settings);
  if (state.status !== 'pinned') {
    printer.line(`[aviso] o manifesto mudou durante o download: ${manifestText(state)}.`);
    return ExitCode.dependency;
  }
  return printIntegrity(await verifyPinned(state.manifest, settings), state.manifest.modelRef, printer);
}
