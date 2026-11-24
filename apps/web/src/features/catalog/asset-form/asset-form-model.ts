import {
  AssetMetadataInputSchema,
  SaveAssetVersionByReferenceRequestSchema,
  type AssetMetadataInput,
  type AssetVersionView,
} from '@studio/shared/api';
import {
  AssetIdSchema,
  TagSchema,
  type AssetKind,
  type AssetLayout,
  type LicenseUse,
  type ProvenanceSource,
  type Sensitivity,
} from '@studio/shared/catalog';
import { z } from 'zod';
import { type FieldErrors, type FormErrorTexts } from './form-messages';
import {
  defaultDetailFields,
  detailFieldsOf,
  parseKindDetails,
  variableRowsOf,
  type DetailFields,
  type PromptVariableRow,
} from './kind-details-model';

/** How the bytes of the version arrive (design/telas/04 "Como adicionar", plus N+1 metadata edits). */
export type ContentMode = 'upload' | 'reference' | 'previous';

export type ProvenanceOrigin = 'none' | 'url' | 'created-here' | 'inherited';

/** Every value of the upload form as text, booleans and lists (design/telas/04). */
export interface AssetFormValues {
  kind: AssetKind;
  contentMode: ContentMode;
  layout: AssetLayout;
  files: readonly File[];
  referencePath: string;
  name: string;
  assetId: string;
  /** Once the owner edits the id, the name stops regenerating it. */
  assetIdEdited: boolean;
  tags: string;
  owner: string;
  sensitivity: Sensitivity;
  notes: string;
  /** Carried from the previous version; the form has no field for it (topology 3.2 search text). */
  summary: string;
  licenseName: string;
  licenseUrl: string;
  licenseReadOn: string;
  licenseUses: readonly LicenseUse[];
  licenseTerms: string;
  origin: ProvenanceOrigin;
  originUrl: string;
  author: string;
  capturedOn: string;
  inheritedSource: ProvenanceSource | null;
  details: DetailFields;
  variables: readonly PromptVariableRow[];
}

/** Element ids of the form fields; error keys and focus targets. */
export const fieldIds = {
  kind: 'tipo-ativo',
  files: 'arquivo',
  referencePath: 'caminho',
  name: 'nome',
  assetId: 'id-ativo',
  tags: 'etiquetas',
  owner: 'proprietario',
  sensitivity: 'sensibilidade',
  notes: 'notas',
  licenseName: 'licenca-nome',
  licenseUrl: 'licenca-url',
  licenseReadOn: 'licenca-lida',
  licenseUses: 'licenca-usos',
  licenseTerms: 'licenca-termos',
  origin: 'origem',
  originUrl: 'origem-url',
  author: 'autor',
  capturedOn: 'captura',
};

/** design/telas/04: "gerado do nome em minúsculas com hífens". */
export function assetIdFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export function emptyAssetForm(kind: AssetKind = 'template'): AssetFormValues {
  return {
    kind,
    contentMode: 'upload',
    layout: kind === 'skill' ? 'folder' : 'file',
    files: [],
    referencePath: '',
    name: '',
    assetId: '',
    assetIdEdited: false,
    tags: '',
    owner: '',
    sensitivity: 'normal',
    notes: '',
    summary: '',
    licenseName: '',
    licenseUrl: '',
    licenseReadOn: '',
    licenseUses: [],
    licenseTerms: '',
    origin: 'none',
    originUrl: '',
    author: '',
    capturedOn: '',
    inheritedSource: null,
    details: defaultDetailFields(kind),
    variables: [],
  };
}

function originOf(source: ProvenanceSource | undefined): ProvenanceOrigin {
  if (source === undefined) return 'none';
  if (source.type === 'url') return 'url';
  return source.type === 'created-here' ? 'created-here' : 'inherited';
}

/** design/telas/03 "Nova versão": the metadata of version N, copied; saving makes N+1. */
export function assetFormFrom(version: AssetVersionView): AssetFormValues {
  const { license, provenance } = version;
  const source = provenance?.source;
  return {
    ...emptyAssetForm(version.kind),
    contentMode: 'previous',
    layout: version.layout,
    name: version.name,
    assetId: version.id,
    assetIdEdited: true,
    tags: version.tags.join(', '),
    owner: version.owner,
    sensitivity: version.sensitivity,
    notes: version.notes,
    summary: version.summary,
    licenseName: license?.name ?? '',
    licenseUrl: license?.url ?? '',
    licenseReadOn: license?.readOn ?? '',
    licenseUses: license?.allowedUses ?? [],
    licenseTerms: license?.terms ?? '',
    origin: originOf(source),
    originUrl: source?.type === 'url' ? source.url : '',
    author: provenance?.author ?? '',
    capturedOn: provenance?.capturedAt?.slice(0, 10) ?? '',
    inheritedSource: source !== undefined && originOf(source) === 'inherited' ? source : null,
    details: detailFieldsOf(version),
    variables: variableRowsOf(version),
  };
}

const UrlSchema = z.string().url().max(2048);

/**
 * Step 1 of the by-reference path rule (SPEC 0002 rev 4, section 13.4), from the frozen C10 request
 * schema: absolute, normalized, no trailing separator. Steps 2 to 6 need the file system, so only
 * the api runs them; the web never reads, lists, hashes or previews the path.
 */
const ReferencePathSchema = SaveAssetVersionByReferenceRequestSchema.shape.absolutePath;

/** The typed path text, trimmed; the api receives exactly this string. */
export function referencePathOf(values: Pick<AssetFormValues, 'referencePath'>): string {
  return values.referencePath.trim();
}

function tagsOf(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

function licenseOf(values: AssetFormValues, errors: Record<string, string>, m: FormErrorTexts): AssetMetadataInput['license'] {
  const anyFilled =
    values.licenseName.trim() !== '' ||
    values.licenseUrl.trim() !== '' ||
    values.licenseReadOn !== '' ||
    values.licenseUses.length > 0 ||
    values.licenseTerms.trim() !== '';
  if (!anyFilled) return null;
  if (values.licenseName.trim() === '') errors[fieldIds.licenseName] = m.required;
  if (values.licenseReadOn === '') errors[fieldIds.licenseReadOn] = m.required;
  if (values.licenseUses.length === 0) errors[fieldIds.licenseUses] = m.licenseUses;
  const url = values.licenseUrl.trim();
  if (url !== '' && !UrlSchema.safeParse(url).success) errors[fieldIds.licenseUrl] = m.url;
  return {
    name: values.licenseName.trim(),
    url: url === '' ? null : url,
    readOn: values.licenseReadOn,
    allowedUses: [...values.licenseUses],
    terms: values.licenseTerms.trim(),
  };
}

function provenanceSourceOf(values: AssetFormValues, errors: Record<string, string>, m: FormErrorTexts): ProvenanceSource | null {
  switch (values.origin) {
    case 'none':
      return null;
    case 'created-here':
      return { type: 'created-here' };
    case 'inherited':
      return values.inheritedSource;
    case 'url': {
      const url = values.originUrl.trim();
      if (!UrlSchema.safeParse(url).success) errors[fieldIds.originUrl] = m.url;
      return { type: 'url', url };
    }
  }
}

function provenanceOf(values: AssetFormValues, errors: Record<string, string>, m: FormErrorTexts): AssetMetadataInput['provenance'] {
  const source = provenanceSourceOf(values, errors, m);
  const author = values.author.trim();
  if (source === null) {
    if (author !== '' || values.capturedOn !== '') errors[fieldIds.origin] = m.origin;
    return null;
  }
  if (author === '') errors[fieldIds.author] = m.required;
  return { source, author, capturedAt: values.capturedOn === '' ? null : `${values.capturedOn}T00:00:00.000Z` };
}

/** Maps a C10 `AssetMetadataInput` issue path to the form field that holds it. */
export function fieldIdOfMetadataPath(path: string): string | null {
  const key = path.replace(/^fields\./, '').replace(/^metadata\./, '').split('.')[0] ?? '';
  const direct: Readonly<Record<string, string>> = {
    name: fieldIds.name,
    assetId: fieldIds.assetId,
    tags: fieldIds.tags,
    owner: fieldIds.owner,
    sensitivity: fieldIds.sensitivity,
    notes: fieldIds.notes,
    license: fieldIds.licenseName,
    provenance: fieldIds.origin,
    kind: fieldIds.kind,
    absolutePath: fieldIds.referencePath,
    mimeType: fieldIds.referencePath,
  };
  return direct[key] ?? null;
}

export type MetadataResult = { ok: true; metadata: AssetMetadataInput } | { ok: false; errors: FieldErrors };

/** The C10 `AssetMetadataInput` of the form, or every field error that blocks the save. */
export function buildAssetMetadata(values: AssetFormValues, m: FormErrorTexts): MetadataResult {
  const errors: Record<string, string> = {};
  if (values.name.trim() === '') errors[fieldIds.name] = m.name;
  if (!AssetIdSchema.safeParse(values.assetId).success) errors[fieldIds.assetId] = m.assetId;
  if (values.owner.trim() === '') errors[fieldIds.owner] = m.required;
  const tags = tagsOf(values.tags);
  if (!tags.every((tag) => TagSchema.safeParse(tag).success)) errors[fieldIds.tags] = m.tags;
  const license = licenseOf(values, errors, m);
  const provenance = provenanceOf(values, errors, m);
  const details = parseKindDetails(values.kind, values.details, values.variables, m);
  if (!details.ok) Object.assign(errors, details.errors);
  if (values.contentMode === 'reference' && !ReferencePathSchema.safeParse(referencePathOf(values)).success) {
    errors[fieldIds.referencePath] = m.path;
  }
  if (values.contentMode === 'upload' && values.sensitivity === 'biometric') errors[fieldIds.sensitivity] = m.biometricUpload;
  if (Object.keys(errors).length > 0 || !details.ok) return { ok: false, errors };

  const metadata: AssetMetadataInput = {
    name: values.name.trim(),
    summary: values.summary === '' ? undefined : values.summary,
    tags,
    owner: values.owner.trim(),
    provenance,
    license,
    sensitivity: values.sensitivity,
    notes: values.notes.trim(),
    details: details.details,
  };
  const checked = AssetMetadataInputSchema.safeParse(metadata);
  if (checked.success) return { ok: true, metadata: checked.data };
  for (const issue of checked.error.issues) {
    const fieldId = fieldIdOfMetadataPath(issue.path.join('.')) ?? fieldIds.name;
    errors[fieldId] ??= m.invalid;
  }
  return { ok: false, errors };
}
