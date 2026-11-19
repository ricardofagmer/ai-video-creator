import { type ChecklistItem, type RecipeCheck, type RecipeFormat, type RecipeGate, type RecipeStage, type RubricCriterion } from '@studio/shared/recipes';
import { stageOrder, type CheckId, type StageId } from '@studio/shared/run-format';

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
export const defaultChecklist: readonly ChecklistItem[] = [
  { id: 'claimsVerified', label: 'Afirmações verificadas em fontes ou em teste reproduzível', required: true },
  { id: 'toolFactsCurrent', label: 'Nome, interface, preço e disponibilidade da ferramenta atuais na data da revisão', required: true },
  { id: 'mediaLicensesDocumented', label: 'Licenças de mídia e direitos de voz documentados', required: true },
  { id: 'noPersonalOrConfidentialData', label: 'Sem dados pessoais, chaves, contas de clientes ou telas confidenciais', required: true },
  {
    id: 'technicalSpecOk',
    label: 'Especificação técnica da receita atendida (duração, formato, narração inteligível, legendas na área segura)',
    required: true,
  },
  { id: 'metadataAndDisclosuresAccurate', label: 'Miniatura, título, hashtags, afiliação e avisos de IA corretos', required: true },
  { id: 'previewWatchedFully', label: 'Vídeo assistido do começo ao fim', required: true },
  { id: 'accountAndPermissionConfirmed', label: 'Conta de criador, visibilidade e permissão explícita confirmadas', required: true },
];

/** Every stage on, with its default checks (C2 `graph.stages` in canonical order). */
export function defaultStages(): RecipeStage[] {
  return stageOrder.map((stageId) => ({ stageId, enabled: true, checks: [...defaultStageChecks[stageId]], timeoutMs: null, params: {} }));
}

/** Gate the editor offers on top of the implicit `plan` and `final` gates (design/telas/06). */
export const scriptApprovalGate: RecipeGate = {
  id: 'script-approval',
  afterStage: 'script',
  label: 'Aprovação do roteiro',
  whatToDo: 'Leia o roteiro e aprove para seguir, ou peça ajustes.',
};
