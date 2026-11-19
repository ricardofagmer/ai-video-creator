import {
  NEEDS_PERSON_ACTION,
  RETRY_STEP_ACTION,
  RecoveryActionSchema,
  ScriptOutputSchema,
  type DirectorPacket,
  type PlanOutput,
  type PlannerPacket,
  type RecoveryAction,
  type RecoveryPacket,
  type ReviewPacket,
  type ReviewVerdict,
  type ScenesOutput,
  type ScriptOutput,
} from '@studio/shared/agents';
import { PhaseIdSchema, stagePhase } from '@studio/shared/run-format';

/**
 * Mock agent answers. Each builder's result is parsed by the role's C7 output schema in
 * `MockAgentsService`, and the static ones here at load, so a contract change breaks loudly.
 */

/** Verified claims of the fixture app; `claims.json` and the script cite the same ids. */
export const mockClaims = [
  { claimId: 'c1', text: 'O catálogo guarda ativos com versão e hash.', evidenceRef: 'captures-index:cap-1' },
  { claimId: 'c2', text: 'Uma receita fixa etapas, verificações e ativos vinculados.', evidenceRef: 'captures-index:cap-2' },
  { claimId: 'c3', text: 'A execução mostra cada etapa e passo ao vivo.', evidenceRef: 'captures-index:cap-3' },
];

export const mockCaptures = [
  { captureId: 'cap-1', label: 'Catálogo', durationMs: 18_000 },
  { captureId: 'cap-2', label: 'Receitas', durationMs: 20_000 },
  { captureId: 'cap-3', label: 'Execução', durationMs: 20_000 },
];

export const mockScript: ScriptOutput = ScriptOutputSchema.parse({
  title: 'Tour do app de exemplo',
  hook: 'Do ativo ao vídeo pronto, sem perder o controle.',
  scenes: [
    { sceneId: 's1', narration: 'O catálogo guarda cada ativo com versão e hash.', onScreenText: 'Catálogo', claimIds: ['c1'], estDurationSec: 18 },
    { sceneId: 's2', narration: 'A receita fixa etapas, verificações e ativos.', onScreenText: 'Receitas', claimIds: ['c2'], estDurationSec: 20 },
    { sceneId: 's3', narration: 'E a execução mostra cada passo ao vivo.', onScreenText: 'Execução', claimIds: ['c3'], estDurationSec: 20 },
  ],
  totalEstDurationSec: 58,
});

const mockRetryStep: RecoveryAction = RecoveryActionSchema.parse({
  resolved: true,
  cause: 'Modo simulado: falha reproduzida de propósito pelo cenário de teste.',
  action: { kind: RETRY_STEP_ACTION },
  whatWasDone: 'Pedi uma nova tentativa do passo.',
  needsPerson: false,
  whatToDo: '',
});

const mockNeedsPerson: RecoveryAction = RecoveryActionSchema.parse({
  resolved: false,
  cause: 'Modo simulado: nenhuma correção automática permitida neste passo.',
  action: { kind: NEEDS_PERSON_ACTION },
  whatWasDone: 'Nada; a falha foi reproduzida de propósito.',
  needsPerson: true,
  whatToDo: 'Rode de novo sem o cenário de falha.',
});

/**
 * Retries the step whenever the engine allows it (the R1-08 allowlist permits `retry-step` on every
 * step), so a forced failure walks the real attempt and recovery bounds (criterion 15) instead of
 * stopping at the first Recovery call; `needs-person` only when the engine offers nothing else.
 */
export function mockRecoveryActionFor(packet: RecoveryPacket): RecoveryAction {
  return packet.inputs.allowedActions.includes(RETRY_STEP_ACTION) ? mockRetryStep : mockNeedsPerson;
}

/** The plan keeps the recipe's stage set and checks (stageSetFixed) at zero cost. */
export function mockPlanFor(packet: PlannerPacket): PlanOutput {
  const phases = PhaseIdSchema.options
    .map((phaseId) => ({
      id: phaseId,
      stages: packet.inputs.recipe.stages
        .filter((stage) => stagePhase[stage.stageId] === phaseId)
        .map((stage) => ({
          stageId: stage.stageId,
          enabled: stage.enabled,
          checks: [...stage.checks],
          estimate: { tokens: 0, ttsChars: 0, renderSec: 0, usd: 0 },
        })),
    }))
    .filter((phase) => phase.stages.length > 0);
  return { phases, totalEstimateUsd: 0, risks: [], questionsForOwner: [] };
}

type SceneVisual = ScenesOutput['scenes'][number]['visual'];

/** One scene per script scene, on its capture, citing only offered refs. */
export function mockScenesFor(packet: DirectorPacket): ScenesOutput {
  const cameraMove = packet.constraints.cameraMoves[0] ?? 'static';
  const transition = packet.constraints.transitions[0] ?? 'cut';
  const scenes = packet.inputs.script.scenes.map((scene, index) => {
    const capture = packet.inputs.capturesIndex[index];
    const visual: SceneVisual =
      capture === undefined
        ? { type: 'title-card', text: scene.onScreenText ?? scene.sceneId }
        : { type: 'capture', captureId: capture.captureId, inMs: 0, outMs: capture.durationMs };
    return {
      sceneId: scene.sceneId,
      visual,
      cameraMove,
      transition,
      ...(scene.onScreenText === undefined ? {} : { onScreenText: scene.onScreenText }),
    };
  });
  return { scenes, citedRefs: packet.inputs.offeredRefs.filter((binding) => binding.slot === 'template').map((binding) => binding.ref) };
}

/** A passing verdict that scores every rubric criterion 4, with evidence and no retry. */
export function mockVerdictFor(packet: ReviewPacket): ReviewVerdict {
  return {
    scores: packet.inputs.rubric.map((criterion) => ({
      criterionId: criterion.criterionId,
      score: 4,
      evidence: `Simulado: ${criterion.description}`.slice(0, 500),
    })),
    overall: 4,
    blockingIssues: [],
    retryRecommended: false,
    retryInstruction: '',
  };
}
