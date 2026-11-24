import { type ChecklistItem, type RecipeCheck, type RecipeFormat, type RecipeGate, type RecipeStage, type RubricCriterion } from '@studio/shared/recipes';
import { stageOrder, type CheckId, type StageId } from '@studio/shared/run-format';
import { type WebMessages } from '@/messages';

type RecipeDefaultTexts = WebMessages['recipes']['defaults'];

/**
 * Starting definition of a brand-new recipe. The values mirror the R1 "Product tour 16:9" recipe
 * (watcher fixture, R1-04); a new version always starts from the version it was opened from.
 */
export const defaultStageChecks: Readonly<Record<StageId, readonly CheckId[]>> = {
  plan: ['output-schema'],
  research: ['outputs-present'],
  verify: ['outputs-present', 'claims-evidence'],
  script: ['output-schema', 'claims-evidence', 'reviewer-score'],
  capture: ['outputs-present'],
  scenes: ['output-schema', 'refs-resolve', 'reviewer-score'],
  narration: ['outputs-present'],
  composition: ['outputs-present'],
  captions: ['caption-timing'],
  fades: ['outputs-present'],
  music: ['outputs-present'],
  qa: ['container', 'codec', 'resolution', 'fps', 'duration', 'loudness', 'true-peak', 'audio-present', 'black-frames', 'caption-timing', 'output-schema'],
  'agent-review': ['reviewer-score', 'output-schema'],
  package: ['outputs-present', 'output-schema'],
};

export const defaultChecks: readonly RecipeCheck[] = [
  { id: 'output-schema' },
  { id: 'refs-resolve' },
  { id: 'claims-evidence' },
  { id: 'container', formats: ['mp4'] },
  { id: 'codec', video: 'h264', audio: 'aac' },
  { id: 'resolution' },
  { id: 'fps' },
  { id: 'duration' },
  { id: 'loudness' },
  { id: 'true-peak' },
  { id: 'audio-present' },
  { id: 'black-frames', maxRunMs: 500 },
  { id: 'caption-timing', maxDriftMs: 200 },
  { id: 'reviewer-score', minOverall: 3.5 },
  { id: 'outputs-present' },
];

export const defaultFormat: RecipeFormat = {
  canvas: { width: 1920, height: 1080 },
  aspect: '16:9',
  fps: 30,
  duration: { minSec: 45, maxSec: 90 },
  language: 'pt-BR',
  loudness: { integratedLufs: -16, truePeakDbtp: -1, toleranceLu: 1 },
  captions: { yPercent: 88, maxLines: 2 },
  narration: { maxWordsPerSecond: 2.8 },
  sceneCount: { min: 3, max: 8 },
};

export const defaultRubric: readonly RubricCriterion[] = [
  {
    criterionId: 'clareza',
    description: 'A mensagem principal fica clara para quem não conhece o produto.',
    weight: 40,
    threshold: 3,
    subjects: ['script', 'scenes', 'render'],
  },
  { criterionId: 'fidelidade', description: 'Toda afirmação do roteiro tem evidência nas capturas.', weight: 35, threshold: 4, subjects: ['script'] },
  { criterionId: 'ritmo', description: 'Cortes e narração no mesmo tempo, sem trechos parados.', weight: 25, threshold: 3, subjects: ['scenes', 'render'] },
];

/** design/componentes-estudio.md section 15: the 8 `publishChecklistItems`, all required. */
const defaultChecklistIds = [
  'claimsVerified',
  'toolFactsCurrent',
  'mediaLicensesDocumented',
  'noPersonalOrConfidentialData',
  'technicalSpecOk',
  'metadataAndDisclosuresAccurate',
  'previewWatchedFully',
  'accountAndPermissionConfirmed',
] as const satisfies readonly (keyof RecipeDefaultTexts['checklist'])[];

/** The starting checklist of a new recipe, written in the owner's language. */
export function defaultChecklistOf(texts: RecipeDefaultTexts): ChecklistItem[] {
  return defaultChecklistIds.map((id) => ({ id, label: texts.checklist[id], required: true }));
}

/** Every stage on, with its default checks (C2 `graph.stages` in canonical order). */
export function defaultStages(): RecipeStage[] {
  return stageOrder.map((stageId) => ({ stageId, enabled: true, checks: [...defaultStageChecks[stageId]], timeoutMs: null, params: {} }));
}

export const SCRIPT_APPROVAL_GATE_ID = 'script-approval';

/** Gate the editor offers on top of the implicit `plan` and `final` gates (design/telas/06). */
export function scriptApprovalGateOf(texts: RecipeDefaultTexts): RecipeGate {
  return { id: SCRIPT_APPROVAL_GATE_ID, afterStage: 'script', label: texts.scriptGate.label, whatToDo: texts.scriptGate.whatToDo };
}
