import { type AssetMetadataInput, type AssetVersionView } from '@studio/shared/api';
import { ApiRequestError, browserStudioClient, type UploadContent } from '@/lib/api';
import { describeApiError } from '@/features/common/api-error-text';
import { formatBytes } from '@studio/ui';
import { assetKindLabels } from '../catalog-labels';
import { folderRelativePath, maxUploadBytesByKind, selectionProblem, withResolvedType } from '../upload-rules';
import { fieldIdOfMetadataPath, fieldIds, referencePathOf, type AssetFormValues, type ContentMode } from './asset-form-model';
import { formMessages, type FieldErrors } from './form-messages';

/** Which save the form performs: a new asset (v1) or version N+1 of an existing one. */
export type AssetFormTarget = { type: 'new' } | { type: 'new-version'; assetId: string; baseVersion: number };

/** True when the selection is a folder: a skill always is, and a folder pick carries relative paths. */
export function isFolderSelection(values: Pick<AssetFormValues, 'kind' | 'files'>): boolean {
  return values.kind === 'skill' || values.files.some((file) => file.webkitRelativePath !== '');
}

/** design/telas/04 "Erros de arquivo" for the current selection, or null when the web sees none. */
export function fileError(values: AssetFormValues): string | null {
  const problem = selectionProblem(values.kind, isFolderSelection(values) ? 'folder' : 'file', values.files);
  if (problem === null) return null;
  switch (problem.type) {
    case 'missing':
      return formMessages.missingFile;
    case 'size':
      return `O arquivo passa do limite de ${formatBytes(maxUploadBytesByKind[values.kind])}.`;
    case 'mime':
      return `Tipo de arquivo não aceito para ${assetKindLabels[values.kind]}.`;
    case 'name':
      return `O nome "${problem.fileName}" tem caracteres não aceitos. Use letras, números, ponto, hífen ou sublinhado.`;
  }
}

function uploadContentOf(values: AssetFormValues): UploadContent | null {
  if (isFolderSelection(values)) {
    const files = values.files.flatMap((file) => {
      const relativePath = folderRelativePath(file);
      return relativePath === null ? [] : [{ file, relativePath }];
    });
    return files.length === values.files.length ? { layout: 'folder', files } : null;
  }
  const [file] = values.files;
  return file === undefined ? null : { layout: 'file', file: withResolvedType(file) };
}

/** C10 reasons that belong to the file field rather than the whole form. */
const fileReasons: ReadonlySet<string> = new Set([
  'mime-type-not-allowed',
  'layout-not-allowed',
  'content-too-large',
  'body-too-large',
  'unsafe-path',
  'unsupported-folder',
  'upload-rejected',
]);

/**
 * C10 reasons that belong to the path field of a by-reference save (SPEC 0002 rev 4, section 13.4):
 * the api's single `reference-path-refused` plus core's own refusals of the referenced target.
 */
const referenceReasons: ReadonlySet<string> = new Set([
  'reference-path-refused',
  'source-not-found',
  'mime-type-not-allowed',
  'layout-not-allowed',
  'content-too-large',
  'unsafe-path',
  'unsupported-folder',
  'biometric-requires-reference',
]);

export type SaveOutcome = { ok: true; saved: AssetVersionView } | { ok: false; fieldErrors: FieldErrors; formError: string | null };

/** Field errors the api reported, keyed like the form's own (C10 `details.issues`). */
function serverFieldErrors(error: ApiRequestError, contentMode: ContentMode): Record<string, string> {
  const errors: Record<string, string> = {};
  const reason = error.reason;
  if (reason === 'asset-already-exists') errors[fieldIds.assetId] = describeApiError(error);
  if (reason !== null && contentMode === 'reference' && referenceReasons.has(reason)) {
    errors[fieldIds.referencePath] = describeApiError(error);
  } else if (reason !== null && fileReasons.has(reason)) {
    errors[fieldIds.files] = describeApiError(error);
  }
  for (const issue of error.issues) {
    const fieldId = fieldIdOfMetadataPath(issue.path);
    if (fieldId !== null) errors[fieldId] ??= formMessages.invalid;
  }
  return errors;
}

function failureOf(error: unknown, contentMode: ContentMode): SaveOutcome {
  const fieldErrors = error instanceof ApiRequestError ? serverFieldErrors(error, contentMode) : {};
  return { ok: false, fieldErrors, formError: `Não foi possível salvar. ${describeApiError(error)}` };
}

/**
 * By reference (SPEC 0002 rev 4): one JSON POST with the PRD 5.2 metadata and the path as typed.
 * The web never reads, lists, hashes or previews the path; the api validates it, derives the layout
 * and, for a file without `mimeType`, the type from the extension (A23), so none is sent here.
 */
function saveByReference(target: AssetFormTarget, values: AssetFormValues, metadata: AssetMetadataInput): Promise<AssetVersionView> {
  const absolutePath = referencePathOf(values);
  return target.type === 'new'
    ? browserStudioClient.registerAssetByReference({ assetId: values.assetId, kind: values.kind, absolutePath, metadata })
    : browserStudioClient.saveAssetVersionByReference(target.assetId, { absolutePath, metadata });
}

/** Sends the validated metadata through the C10 route that matches the target and content mode. */
export async function saveAsset(target: AssetFormTarget, values: AssetFormValues, metadata: AssetMetadataInput): Promise<SaveOutcome> {
  const client = browserStudioClient;
  try {
    if (target.type === 'new-version' && values.contentMode === 'previous') {
      const saved = await client.saveMetadataVersion(target.assetId, { fromVersion: target.baseVersion, metadata });
      return { ok: true, saved };
    }
    if (values.contentMode === 'reference') return { ok: true, saved: await saveByReference(target, values, metadata) };
    const content = uploadContentOf(values);
    if (content === null) return { ok: false, fieldErrors: { [fieldIds.files]: formMessages.missingFile }, formError: null };
    const saved =
      target.type === 'new'
        ? await client.createAsset({ fields: { assetId: values.assetId, kind: values.kind, metadata }, content })
        : await client.saveAssetVersion(target.assetId, { fields: { metadata }, content });
    return { ok: true, saved };
  } catch (error) {
    return failureOf(error, values.contentMode);
  }
}
