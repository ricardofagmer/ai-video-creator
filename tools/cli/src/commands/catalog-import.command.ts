import { AssetVersionMetadataSchema, CreateAssetCommand, InvalidAssetInputError, type AssetVersionMetadata } from '@studio/core/catalog';
import { AssetKindSchema, SensitivitySchema, formatAssetRef, type Sensitivity } from '@studio/shared/catalog';
import { detectBiometricSource, registeredBiometricPaths } from '../catalog/biometric-detection.js';
import { scanCatalogVersions } from '../catalog/catalog-scan.js';
import { assertImportSize, inspectImportSource, toContentInput } from '../catalog/import-source.js';
import { BiometricImportRefusedError, CatalogScanLimitError, CliUsageError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { withCliContext, type CliContext } from '../nest/cli-context.js';
import { readJsonInputFile } from '../terminal/json-input-file.js';
import { type CommandDependencies } from './command-dependencies.js';

export interface CatalogImportOptions {
  path: string;
  kind: string;
  /** C1 `AssetId` of the new asset. */
  id: string;
  /** JSON file with the PRD 5.2 owner metadata (name, owner, provenance, license, details, ...). */
  metadata: string;
  sensitivity?: string;
  byReference: boolean;
  mime?: string;
}

function parseSensitivityFlag(value: string | undefined): Sensitivity | undefined {
  if (value === undefined) return undefined;
  const parsed = SensitivitySchema.safeParse(value);
  if (!parsed.success) throw new CliUsageError(`--sensitivity aceita: ${SensitivitySchema.options.join(', ')}.`);
  return parsed.data;
}

/** The flag fills a missing `sensitivity`; when both are given they must agree. */
function mergeSensitivity(raw: unknown, flag: Sensitivity | undefined): AssetVersionMetadata {
  let candidate = raw;
  if (flag !== undefined && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    if ('sensitivity' in raw && raw.sensitivity !== flag) throw new BiometricImportRefusedError('sensitivity-mismatch');
    candidate = { ...raw, sensitivity: flag };
  }
  const parsed = AssetVersionMetadataSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidAssetInputError(parsed.error.issues.map((issue) => ({ path: ['metadata', ...issue.path].join('.'), message: issue.message })));
  }
  return parsed.data;
}

async function biometricRegistry(context: CliContext, signal: AbortSignal): Promise<string[]> {
  try {
    return registeredBiometricPaths(await scanCatalogVersions(context.queryBus, signal));
  } catch (error) {
    if (error instanceof CatalogScanLimitError) throw new BiometricImportRefusedError('registry-unreadable');
    throw error;
  }
}

/**
 * `studio catalog import <path> --kind <kind> --id <assetId> --metadata <file.json>`: validates path,
 * kind and size at the boundary, refuses biometric material unless it is registered by reference
 * with `--sensitivity biometric --by-reference` (PRD 12, criterion 22), then creates version 1 as
 * `draft` through core `CreateAssetCommand`. The path is never printed or logged here.
 */
export async function catalogImportCommand(options: CatalogImportOptions, dependencies: CommandDependencies): Promise<number> {
  const kindResult = AssetKindSchema.safeParse(options.kind);
  if (!kindResult.success) throw new CliUsageError(`--kind aceita: ${AssetKindSchema.options.join(', ')}.`);
  const kind = kindResult.data;
  const flag = parseSensitivityFlag(options.sensitivity);
  const rawMetadata = await readJsonInputFile('metadata', options.metadata);
  const metadata = mergeSensitivity(rawMetadata, flag);
  const source = await inspectImportSource(options.path);

  const created = await withCliContext(async (context) => {
    const detected = await detectBiometricSource(source.absolutePath, rawMetadata, await biometricRegistry(context, dependencies.signal));
    const biometric = detected !== null || metadata.sensitivity === 'biometric';
    if (biometric && (flag !== 'biometric' || !options.byReference || metadata.sensitivity !== 'biometric')) {
      throw new BiometricImportRefusedError('flags-missing');
    }
    assertImportSize(source, kind, options.byReference);
    const content = toContentInput(source, options.byReference, options.mime);
    return context.commandBus.execute(new CreateAssetCommand({ assetId: options.id, kind, metadata, content, signal: dependencies.signal }));
  });

  const ref = formatAssetRef({ assetId: created.id, version: created.version });
  const mode = created.storage.mode === 'reference' ? 'por referência (nada foi copiado)' : 'copiado para o acervo';
  dependencies.printer.line(`Asset ${ref} (${created.kind}) criado como rascunho, ${mode}.`);
  dependencies.printer.line('Ative a versão pelo web quando os metadados estiverem completos.');
  return ExitCode.ok;
}
