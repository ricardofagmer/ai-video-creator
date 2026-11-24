import { RecipeDefinitionInputSchema, type RecipeDefinitionInput } from '@studio/shared/api';
import { type AspectRatio, type AssetKind, type TemplateDetails } from '@studio/shared/catalog';
import { RecipeIdSchema, researchStageParams, type Binding, type BriefField, type ChecklistItem, type Language, type RecipeCheck, type RecipeStage } from '@studio/shared/recipes';
import { mandatoryStages, stageOrder, type StageId } from '@studio/shared/run-format';
import { type WebMessages } from '@/messages';
import {
  SCRIPT_APPROVAL_GATE_ID,
  defaultChecklistOf,
  defaultChecks,
  defaultFormat,
  defaultRubric,
  defaultStageChecks,
  scriptApprovalGateOf,
} from './recipe-defaults';
import { WRITER_SKILLS_MAX } from '@studio/shared/agents';
import { WRITER_SKILL_SLOT, isKnownSlot, slotsForStages, editorKinds } from './recipe-slots';

type RecipeTexts = WebMessages['recipes'];

/** One active catalog version a slot may pin (C2 binding: `assetId@version` plus `contentHash`). */
export interface BindingOption {
  ref: string;
  contentHash: string;
  kind: AssetKind;
  label: string;
  /** Template options only: what the recipe's format is checked against (guided-creation spec section 3). */
  templateDetails?: TemplateDetails;
  /** Voice options only: the editor offers "Ouvir" next to the chosen voice. */
  voice?: boolean;
}

/** The editable part of a recipe as form text; `base` keeps every field the form does not edit. */
export interface RecipeFormValues {
  name: string;
  recipeId: string;
  recipeIdEdited: boolean;
  description: string;
  owner: string;
  width: string;
  height: string;
  fps: string;
  durationMin: string;
  durationMax: string;
  language: Language;
  integratedLufs: string;
  truePeakDbtp: string;
  enabledStages: readonly StageId[];
  /** Chosen `assetId@version` per known slot; '' leaves the slot unbound. */
  bindings: Readonly<Record<string, string>>;
  /** `skill:writer` refs in order (at most `WRITER_SKILLS_MAX`); the slot repeats, so it lives apart from `bindings`. */
  writerSkills: readonly string[];
  scriptApproval: boolean;
  /** `params.siteAnalysis` of the research stage (docs/specs/2026-11-23-site-analysis-design.md). */
  siteAnalysis: boolean;
  requireSourceUrl: boolean;
  requireKeyMessages: boolean;
  checklist: readonly ChecklistItem[];
  base: RecipeDefinitionInput | null;
}

export const recipeFieldIds = {
  name: 'nome-receita',
  recipeId: 'id-receita',
  description: 'descricao-receita',
  owner: 'proprietario-receita',
  width: 'largura',
  height: 'altura',
  fps: 'fps',
  durationMin: 'duracao-minima',
  durationMax: 'duracao-maxima',
  language: 'idioma',
  integratedLufs: 'loudness-alvo',
  truePeakDbtp: 'pico-maximo',
  stages: 'etapas',
};

export const BINDING_ID_PREFIX = 'vinculo';

/** Same id BindingList gives the slot's control (`{idPrefix}-{slot}`). */
export function bindingFieldId(slot: string): string {
  return `${BINDING_ID_PREFIX}-${slot.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

export function recipeIdFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export function emptyRecipeForm(defaults: RecipeTexts['defaults']): RecipeFormValues {
  const { canvas, fps, duration, language, loudness } = defaultFormat;
  return {
    name: '',
    recipeId: '',
    recipeIdEdited: false,
    description: '',
    owner: '',
    width: String(canvas.width),
    height: String(canvas.height),
    fps: String(fps),
    durationMin: String(duration.minSec),
    durationMax: String(duration.maxSec),
    language,
    integratedLufs: String(loudness.integratedLufs),
    truePeakDbtp: String(loudness.truePeakDbtp),
    enabledStages: [...stageOrder],
    bindings: {},
    writerSkills: [],
    scriptApproval: false,
    siteAnalysis: true,
    requireSourceUrl: true,
    requireKeyMessages: true,
    checklist: defaultChecklistOf(defaults),
    base: null,
  };
}

/** design/telas/06: the editor opens version N; saving makes N+1 and leaves N unchanged. */
export function recipeFormFrom(id: string, definition: RecipeDefinitionInput): RecipeFormValues {
  const { canvas, fps, duration, language, loudness } = definition.format;
  return {
    name: definition.name,
    recipeId: id,
    recipeIdEdited: true,
    description: definition.description,
    owner: definition.owner,
    width: String(canvas.width),
    height: String(canvas.height),
    fps: String(fps),
    durationMin: String(duration.minSec),
    durationMax: String(duration.maxSec),
    language,
    integratedLufs: String(loudness.integratedLufs),
    truePeakDbtp: String(loudness.truePeakDbtp),
    enabledStages: definition.graph.stages.filter((stage) => stage.enabled).map((stage) => stage.stageId),
    bindings: Object.fromEntries(definition.bindings.filter((binding) => isKnownSlot(binding.slot)).map((binding) => [binding.slot, binding.ref])),
    writerSkills: definition.bindings.filter((binding) => binding.slot === WRITER_SKILL_SLOT).map((binding) => binding.ref).slice(0, WRITER_SKILLS_MAX),
    scriptApproval: definition.gates.some((gate) => gate.id === SCRIPT_APPROVAL_GATE_ID),
    siteAnalysis: researchStageParams(definition.graph.stages.find((stage) => stage.stageId === 'research')?.params ?? {}).siteAnalysis,
    requireSourceUrl: definition.inputs.required.includes('sourceUrl'),
    requireKeyMessages: definition.inputs.required.includes('keyMessages'),
    checklist: definition.checklist.map((item) => ({ ...item })),
    base: definition,
  };
}

const aspects: readonly { aspect: AspectRatio; ratio: number }[] = [
  { aspect: '16:9', ratio: 16 / 9 },
  { aspect: '9:16', ratio: 9 / 16 },
  { aspect: '1:1', ratio: 1 },
];

export function aspectOf(width: number, height: number): AspectRatio | null {
  return aspects.find((candidate) => Math.abs(width / height - candidate.ratio) <= 0.01)?.aspect ?? null;
}

/** Every stage in canonical order: the base entry when there is one (checks, params kept), else a default; research takes the switch. */
export function stagesOf(values: RecipeFormValues): RecipeStage[] {
  const enabled = new Set<StageId>([...values.enabledStages, ...mandatoryStages]);
  return stageOrder.map((stageId) => {
    const existing = values.base?.graph.stages.find((stage) => stage.stageId === stageId);
    const stage = existing ?? { stageId, enabled: false, checks: [...defaultStageChecks[stageId]], timeoutMs: null, params: {} };
    const params = stageId === 'research' ? { ...stage.params, siteAnalysis: values.siteAnalysis } : stage.params;
    return { ...stage, enabled: enabled.has(stageId), params };
  });
}

/** The base checks plus any default definition a newly added stage refers to (C2: checks are defined once). */
function checksFor(stages: readonly RecipeStage[], base: readonly RecipeCheck[]): RecipeCheck[] {
  const checks = [...base];
  for (const checkId of stages.flatMap((stage) => stage.checks)) {
    if (checks.some((check) => check.id === checkId)) continue;
    const fallback = defaultChecks.find((check) => check.id === checkId);
    if (fallback !== undefined) checks.push(fallback);
  }
  return checks;
}

/** Known slots of enabled stages with a chosen version, the writer's skills, plus the base's own extra slots. */
export function bindingsOf(values: RecipeFormValues, options: readonly BindingOption[], enabled: ReadonlySet<StageId>): Binding[] {
  const known = slotsForStages(enabled).flatMap((spec) => {
    const ref = values.bindings[spec.slot] ?? '';
    const option = options.find((candidate) => candidate.ref === ref && candidate.kind === spec.kind);
    return option === undefined ? [] : [{ slot: spec.slot, ref: option.ref, contentHash: option.contentHash }];
  });
  const skills = enabled.has('script')
    ? values.writerSkills.slice(0, WRITER_SKILLS_MAX).flatMap((ref) => {
        const option = options.find((candidate) => candidate.ref === ref && candidate.kind === 'skill');
        return option === undefined ? [] : [{ slot: WRITER_SKILL_SLOT, ref: option.ref, contentHash: option.contentHash }];
      })
    : [];
  const extra = (values.base?.bindings ?? []).filter((binding) => !isKnownSlot(binding.slot) && binding.slot !== WRITER_SKILL_SLOT);
  return [...known, ...skills, ...extra];
}

export type NumberRead = { value: number; ok: true } | { ok: false };

export function readNumber(text: string): NumberRead {
  const trimmed = text.trim().replace(',', '.');
  const value = Number(trimmed);
  return trimmed === '' || !Number.isFinite(value) ? { ok: false } : { ok: true, value };
}

interface DefinitionDraft {
  definition: unknown;
  /** Field errors found while reading the text values, before the C10 schema check. */
  errors: Record<string, string>;
}

/** Reads the form into a candidate C2 definition, keeping every base field the form does not edit. */
function draftDefinition(values: RecipeFormValues, options: readonly BindingOption[], t: RecipeTexts): DefinitionDraft {
  const errors: Record<string, string> = {};
  const number = (key: keyof typeof recipeFieldIds, text: string): number => {
    const read = readNumber(text);
    if (!read.ok) {
      errors[recipeFieldIds[key]] = t.errors.number;
      return 0;
    }
    return read.value;
  };
  const width = number('width', values.width);
  const height = number('height', values.height);
  const aspect = width > 0 && height > 0 ? aspectOf(width, height) : null;
  if (aspect === null && errors[recipeFieldIds.width] === undefined && errors[recipeFieldIds.height] === undefined) {
    errors[recipeFieldIds.width] = t.errors.aspect;
  }
  const base = values.base;
  const format = base?.format ?? defaultFormat;
  const stages = stagesOf(values);
  const enabled = new Set(stages.filter((stage) => stage.enabled).map((stage) => stage.stageId));
  const inputs = base?.inputs ?? { required: [], keyMessages: { min: 1, max: 5 } };
  const keyMessages = values.requireKeyMessages
    ? { min: Math.max(inputs.keyMessages.min, 1), max: Math.max(inputs.keyMessages.max, 1) }
    : { min: 0, max: inputs.keyMessages.max };
  const otherGates = (base?.gates ?? []).filter((gate) => gate.id !== SCRIPT_APPROVAL_GATE_ID && enabled.has(gate.afterStage));
  const gates = values.scriptApproval && enabled.has('script') ? [...otherGates, scriptApprovalGateOf(t.defaults)] : otherGates;
  const bindings = bindingsOf(values, options, enabled);
  const boundKinds = options.filter((option) => bindings.some((binding) => binding.ref === option.ref)).map((option) => option.kind);
  const allowedKinds = [...new Set<AssetKind>([...(base?.allowedKinds ?? editorKinds), ...boundKinds])];
  const required: BriefField[] = [];
  if (values.requireSourceUrl) required.push('sourceUrl');
  if (values.requireKeyMessages) required.push('keyMessages');

  const definition = {
    name: values.name.trim(),
    description: values.description.trim(),
    owner: values.owner.trim(),
    provenance: base?.provenance ?? null,
    notes: base?.notes ?? '',
    graph: { stages },
    bindings,
    format: {
      ...format,
      canvas: { width, height },
      aspect: aspect ?? format.aspect,
      fps: number('fps', values.fps),
      duration: { minSec: number('durationMin', values.durationMin), maxSec: number('durationMax', values.durationMax) },
      language: values.language,
      loudness: { ...format.loudness, integratedLufs: number('integratedLufs', values.integratedLufs), truePeakDbtp: number('truePeakDbtp', values.truePeakDbtp) },
    },
    gates,
    inputs: { required, keyMessages },
    checks: checksFor(stages, base?.checks ?? defaultChecks),
    limits: base?.limits ?? {},
    rubric: base?.rubric ?? [...defaultRubric],
    checklist: values.checklist.map((item) => ({ ...item })),
    allowedKinds,
  };
  return { definition, errors };
}

/** C10 issue path of a definition (or `definition.<path>`) to the form field that shows it. */
export function recipeFieldOfPath(path: string): string | null {
  const parts = path.replace(/^definition\./, '').split('.');
  const [first, second] = parts;
  if (first === 'name') return recipeFieldIds.name;
  if (first === 'description') return recipeFieldIds.description;
  if (first === 'owner') return recipeFieldIds.owner;
  if (first === 'recipeId') return recipeFieldIds.recipeId;
  if (first === 'graph') return recipeFieldIds.stages;
  if (first === 'format') {
    const byFormatKey: Readonly<Record<string, string>> = {
      canvas: recipeFieldIds.width,
      aspect: recipeFieldIds.width,
      fps: recipeFieldIds.fps,
      duration: recipeFieldIds.durationMin,
      language: recipeFieldIds.language,
      loudness: recipeFieldIds.integratedLufs,
    };
    return byFormatKey[second ?? ''] ?? recipeFieldIds.width;
  }
  return null;
}

export type DefinitionResult = { ok: true; definition: RecipeDefinitionInput } | { ok: false; errors: Record<string, string> };

/** The checked C2 definition, or the field errors that block the save (design/telas/06). */
export function buildRecipeDefinition(
  values: RecipeFormValues,
  options: readonly BindingOption[],
  isNew: boolean,
  t: RecipeTexts,
): DefinitionResult {
  const { definition, errors } = draftDefinition(values, options, t);
  if (values.name.trim() === '') errors[recipeFieldIds.name] = t.errors.name;
  if (values.owner.trim() === '') errors[recipeFieldIds.owner] = t.errors.required;
  if (isNew && !RecipeIdSchema.safeParse(values.recipeId).success) errors[recipeFieldIds.recipeId] = t.errors.recipeId;
  const enabled = new Set<StageId>([...values.enabledStages, ...mandatoryStages]);
  for (const spec of slotsForStages(enabled)) {
    const chosen = values.bindings[spec.slot] ?? '';
    if (!spec.optional && chosen === '') errors[bindingFieldId(spec.slot)] = t.errors.chooseVersion;
  }
  const parsed = RecipeDefinitionInputSchema.safeParse(definition);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const fieldId = recipeFieldOfPath(issue.path.join('.'));
      if (fieldId !== null) errors[fieldId] ??= t.errors.invalid;
    }
    if (Object.keys(errors).length === 0) errors[recipeFieldIds.name] = t.errors.invalid;
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, definition: parsed.data };
}
