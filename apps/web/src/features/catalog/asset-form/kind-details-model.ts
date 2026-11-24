import {
  AiModelDetailsSchema,
  BrandKitDetailsSchema,
  ImageDetailsSchema,
  MusicDetailsSchema,
  PromptDetailsSchema,
  ReferenceDetailsSchema,
  SfxDetailsSchema,
  SkillDetailsSchema,
  TemplateDetailsSchema,
  type AspectRatio,
  type AssetKind,
  type PromptVariable,
} from '@studio/shared/catalog';
import { type AssetVersionView } from '@studio/shared/api';
import { type z } from 'zod';
import { type FieldErrors, type FormErrorTexts } from './form-messages';

/**
 * Kind-specific fields of PRD 5.2 as form text, and their mapping to the C1 `details` of each kind.
 * The form edits strings; this module turns them into typed details and back.
 */
export type DetailFields = Readonly<Record<string, string>>;

export type PromptVariableType = PromptVariable['type'];

export interface PromptVariableRow {
  /** Stable React key for the row; not sent. */
  key: string;
  name: string;
  type: PromptVariableType;
  defaultText: string;
  required: boolean;
  description: string;
}

/** Element id of one detail field (`detalhe-<key>`). */
export function detailFieldId(key: string): string {
  return `detalhe-${key}`;
}

export const VARIABLES_FIELD_ID = 'variaveis';

const brandKitSkeleton = {
  colors: [{ name: 'primaria', hex: '#000000' }],
  fonts: [],
  logoRefs: [],
  captionStyle: { fontFamily: 'Inter', fontSizePx: 48, color: '#FFFFFF', background: null, maxLines: 2 },
  safeZones: [],
  tagHints: [],
  toneOfVoice: '',
  motionStyle: '',
};

/** Starting values when the owner picks a kind for a brand-new asset. */
export function defaultDetailFields(kind: AssetKind): DetailFields {
  switch (kind) {
    case 'template':
      return { engine: 'remotion', fps: '30', inputSchema: '{}', sceneSchema: '', cameraMoves: '', transitions: '' };
    case 'ai-model':
      return { modelType: 'provider-model', provider: 'other', modelIdRefType: 'env', modelIdRefValue: '' };
    case 'reference':
      return { subKind: 'video', referenceNotes: '' };
    case 'skill':
      return { entryFile: 'SKILL.md', description: '' };
    case 'image':
      return { purpose: 'other' };
    case 'brand-kit':
      return { brandKitJson: JSON.stringify(brandKitSkeleton, null, 2) };
    default:
      return {};
  }
}

const joinList = (values: readonly string[]): string => values.join(', ');
const optionalNumber = (value: number | null): string => (value === null ? '' : String(value));

/** The form text of an existing version's details (new version copies the metadata, telas/03). */
export function detailFieldsOf(version: AssetVersionView): DetailFields {
  switch (version.kind) {
    case 'template': {
      const details = version.details;
      return {
        engine: details.engine,
        compositionId: details.compositionId,
        width: String(details.canvas.width),
        height: String(details.canvas.height),
        fps: String(details.fps),
        durationMin: String(details.duration.minSec),
        durationMax: String(details.duration.maxSec),
        inputSchema: JSON.stringify(details.inputSchema, null, 2),
        sceneSchema: details.sceneSchema === null ? '' : JSON.stringify(details.sceneSchema, null, 2),
        cameraMoves: joinList(details.cameraMoves),
        transitions: joinList(details.transitions),
      };
    }
    case 'ai-model': {
      const reference = version.details.modelIdRef;
      return {
        modelType: version.details.modelType,
        provider: version.details.provider,
        modelIdRefType: reference.type,
        modelIdRefValue: reference.type === 'literal' ? reference.value : reference.name,
      };
    }
    case 'reference':
      return { subKind: version.details.subKind, referenceNotes: version.details.referenceNotes };
    case 'skill':
      return { entryFile: version.details.entryFile, description: version.details.description };
    case 'image':
      return { width: String(version.details.width), height: String(version.details.height), purpose: version.details.purpose };
    case 'music':
      return {
        durationSec: String(version.details.durationMs / 1000),
        bpm: optionalNumber(version.details.bpm),
        integratedLufs: optionalNumber(version.details.integratedLufs),
      };
    case 'sfx':
      return { durationSec: String(version.details.durationMs / 1000) };
    case 'brand-kit':
      return { brandKitJson: JSON.stringify(version.details, null, 2) };
    case 'prompt':
      return {};
  }
}

let rowCounter = 0;

/** A row added by the owner; only ever created in the browser, after hydration. */
export function newVariableRow(): PromptVariableRow {
  rowCounter += 1;
  return { key: `variavel-nova-${rowCounter}`, name: '', type: 'string', defaultText: '', required: true, description: '' };
}

/** Rows of an existing version; keys depend on position only, so server and client render alike. */
export function variableRowsOf(version: AssetVersionView): PromptVariableRow[] {
  if (version.kind !== 'prompt') return [];
  return version.details.variables.map((variable, index) => {
    const defaultText =
      variable.default === null ? '' : Array.isArray(variable.default) ? variable.default.join(', ') : String(variable.default);
    return {
      key: `variavel-${index + 1}`,
      name: variable.name,
      type: variable.type,
      defaultText,
      required: variable.required,
      description: variable.description,
    };
  });
}

/** Collects field errors while reading text values into typed ones. */
class FieldReader {
  readonly errors: Record<string, string> = {};

  constructor(
    private readonly fields: DetailFields,
    readonly m: FormErrorTexts,
  ) {}

  text(key: string): string {
    return (this.fields[key] ?? '').trim();
  }

  required(key: string): string {
    const value = this.text(key);
    if (value === '') this.errors[detailFieldId(key)] = this.m.required;
    return value;
  }

  number(key: string, options: { optional?: boolean } = {}): number | null {
    const value = this.text(key);
    if (value === '') {
      if (!options.optional) this.errors[detailFieldId(key)] = this.m.required;
      return null;
    }
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      this.errors[detailFieldId(key)] = this.m.number;
      return null;
    }
    return parsed;
  }

  json(key: string, options: { optional?: boolean } = {}): unknown {
    const value = this.text(key);
    if (value === '') {
      if (!options.optional) this.errors[detailFieldId(key)] = this.m.required;
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      this.errors[detailFieldId(key)] = this.m.json;
      return null;
    }
  }

  list(key: string): string[] {
    return this.text(key)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
  }
}

const aspectRatios: readonly { aspect: AspectRatio; ratio: number }[] = [
  { aspect: '16:9', ratio: 16 / 9 },
  { aspect: '9:16', ratio: 9 / 16 },
  { aspect: '1:1', ratio: 1 },
];

function aspectOf(width: number | null, height: number | null): AspectRatio | null {
  if (width === null || height === null || height === 0) return null;
  return aspectRatios.find((candidate) => Math.abs(width / height - candidate.ratio) <= 0.01)?.aspect ?? null;
}

function variableDefault(row: PromptVariableRow): unknown {
  const text = row.defaultText.trim();
  if (text === '') return null;
  switch (row.type) {
    case 'string':
      return text;
    case 'number':
      return Number(text.replace(',', '.'));
    case 'boolean':
      return text === 'true' || text === 'sim';
    case 'string-list':
      return text
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
  }
}

/** Untyped details as read from the form; the kind's C1 schema has the last word. */
function rawDetails(kind: AssetKind, reader: FieldReader, variables: readonly PromptVariableRow[]): unknown {
  switch (kind) {
    case 'template': {
      const width = reader.number('width');
      const height = reader.number('height');
      const aspect = aspectOf(width, height);
      if (width !== null && height !== null && aspect === null) reader.errors[detailFieldId('width')] = reader.m.aspect;
      return {
        engine: reader.required('engine'),
        compositionId: reader.required('compositionId'),
        canvas: { width, height },
        aspect,
        fps: reader.number('fps'),
        duration: { minSec: reader.number('durationMin'), maxSec: reader.number('durationMax') },
        inputSchema: reader.json('inputSchema'),
        sceneSchema: reader.json('sceneSchema', { optional: true }),
        cameraMoves: reader.list('cameraMoves'),
        transitions: reader.list('transitions'),
      };
    }
    case 'ai-model': {
      const type = reader.required('modelIdRefType');
      const value = reader.required('modelIdRefValue');
      return {
        modelType: reader.required('modelType'),
        provider: reader.required('provider'),
        modelIdRef: type === 'literal' ? { type, value } : { type, name: value },
      };
    }
    case 'reference':
      return { subKind: reader.required('subKind'), referenceNotes: reader.text('referenceNotes') };
    case 'skill':
      return { entryFile: reader.required('entryFile'), description: reader.text('description') };
    case 'image':
      return { width: reader.number('width'), height: reader.number('height'), purpose: reader.required('purpose') };
    case 'music': {
      const seconds = reader.number('durationSec');
      return {
        durationMs: seconds === null ? null : Math.round(seconds * 1000),
        bpm: reader.number('bpm', { optional: true }),
        integratedLufs: reader.number('integratedLufs', { optional: true }),
      };
    }
    case 'sfx': {
      const seconds = reader.number('durationSec');
      return { durationMs: seconds === null ? null : Math.round(seconds * 1000) };
    }
    case 'brand-kit':
      return reader.json('brandKitJson');
    case 'prompt':
      return {
        variables: variables.map((row) => ({
          name: row.name.trim(),
          description: row.description.trim(),
          required: row.required,
          type: row.type,
          default: variableDefault(row),
        })),
      };
  }
}

const detailSchemas: Readonly<Record<AssetKind, z.ZodTypeAny>> = {
  template: TemplateDetailsSchema,
  'ai-model': AiModelDetailsSchema,
  reference: ReferenceDetailsSchema,
  prompt: PromptDetailsSchema,
  skill: SkillDetailsSchema,
  image: ImageDetailsSchema,
  music: MusicDetailsSchema,
  sfx: SfxDetailsSchema,
  'brand-kit': BrandKitDetailsSchema,
};

/** Which form field a C1 details issue belongs to. */
function fieldIdOfIssue(kind: AssetKind, path: readonly PropertyKey[]): string {
  const [first] = path;
  if (kind === 'prompt') return VARIABLES_FIELD_ID;
  if (kind === 'brand-kit') return detailFieldId('brandKitJson');
  if (first === 'canvas' || first === 'aspect') return detailFieldId('width');
  if (first === 'duration') return detailFieldId('durationMin');
  if (first === 'durationMs') return detailFieldId('durationSec');
  if (first === 'modelIdRef') return detailFieldId('modelIdRefValue');
  return detailFieldId(typeof first === 'string' ? first : 'details');
}

export type DetailsResult = { ok: true; details: unknown } | { ok: false; errors: FieldErrors };

/** Typed C1 details for `kind`, or the field errors that stop the save. */
export function parseKindDetails(
  kind: AssetKind,
  fields: DetailFields,
  variables: readonly PromptVariableRow[],
  m: FormErrorTexts,
): DetailsResult {
  const reader = new FieldReader(fields, m);
  const raw = rawDetails(kind, reader, variables);
  if (Object.keys(reader.errors).length > 0) return { ok: false, errors: reader.errors };
  const parsed = detailSchemas[kind].safeParse(raw);
  if (parsed.success) return { ok: true, details: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const fieldId = fieldIdOfIssue(kind, issue.path);
    errors[fieldId] ??= kind === 'brand-kit' || kind === 'prompt' ? `${m.invalid} (${issue.path.join('.')})` : m.invalid;
  }
  return { ok: false, errors };
}
