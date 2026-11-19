import {
  CAPTURE_VISUAL,
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  NEEDS_PERSON_ACTION,
  PLANNER_ROLE,
  RECOVERY_ROLE,
  TITLE_CARD_VISUAL,
  WRITER_ROLE,
  type AgentOutput,
  type AgentPacket,
  type DirectorPacket,
  type ModelRoleName,
  type PlanOutput,
  type PlannerPacket,
  type RecoveryAction,
  type RecoveryPacket,
  type ReviewPacket,
  type ReviewVerdict,
  type ScenesOutput,
  type ScriptOutput,
  type WriterPacket,
} from '@studio/shared/agents';
import { PhaseIdSchema, stagePhase } from '@studio/shared/run-format';

/**
 * Mock Claude answers (ADR 0002 "Mock by default"): deterministic, built from the packet only,
 * zero cost. Each answer is meant to pass the role's C7 output schema; the service parses it like
 * a live answer, so a fixture that drifts from the contract fails loudly.
 */

const ZERO_ESTIMATE = { tokens: 0, ttsChars: 0, renderSec: 0, usd: 0 };
const SCENE_ID_PREFIX = 's';
const MIN_SCENE_SECONDS = 1;

/** Keeps the recipe's stage set and order (stageSetFixed) at zero cost. */
function mockPlan(packet: PlannerPacket): PlanOutput {
  const phases = PhaseIdSchema.options
    .map((phaseId) => ({
      id: phaseId,
      stages: packet.inputs.recipe.stages
        .filter((stage) => stagePhase[stage.stageId] === phaseId)
        .map((stage) => ({ stageId: stage.stageId, enabled: stage.enabled, checks: [...stage.checks], estimate: ZERO_ESTIMATE })),
    }))
    .filter((phase) => phase.stages.length > 0);
  return { phases, totalEstimateUsd: 0, risks: [], questionsForOwner: [] };
}

/**
 * Speaking rate of the toolbox mock voice (`packages/toolbox/src/providers/voice/mock-voice.ts`).
 * The mock narration is padded to it so a mock run lasts the scene estimates and passes the qa
 * duration check; the rate is capped by the recipe's `maxWordsPerSecond`.
 */
const MOCK_VOICE_WORDS_PER_SECOND = 2.4;
const FILLER_WORDS = ['texto', 'de', 'exemplo', 'para', 'a', 'narração', 'simulada'];

function mockNarration(sceneNumber: number, topic: string, wordCount: number): string {
  const opening = `Cena simulada ${sceneNumber} sobre ${topic}`;
  const words = opening.split(/\s+/);
  for (let index = 0; words.length < wordCount; index += 1) {
    words.push(FILLER_WORDS[index % FILLER_WORDS.length] ?? 'texto');
  }
  return `${words.join(' ')}.`;
}

/** One scene per verified claim (at least one), each citing its claim. */
function mockScript(packet: WriterPacket): ScriptOutput {
  const { brief, verifiedClaims, targetDurationSec } = packet.inputs;
  const sceneCount = Math.max(1, Math.min(verifiedClaims.length, packet.constraints.sceneCount.max));
  const seconds = Math.max(MIN_SCENE_SECONDS, Math.floor(targetDurationSec / sceneCount));
  const wordsPerSecond = Math.min(MOCK_VOICE_WORDS_PER_SECOND, packet.constraints.maxWordsPerSecond);
  // From the exact share of the target, rounded up, so the spoken total never falls below the
  // brief's target (and so below the recipe's minimum duration) through flooring.
  const wordCount = Math.max(1, Math.ceil((targetDurationSec / sceneCount) * wordsPerSecond));
  const scenes = Array.from({ length: sceneCount }, (_unused, index) => {
    const claim = verifiedClaims[index];
    return {
      sceneId: `${SCENE_ID_PREFIX}${index + 1}`,
      narration: mockNarration(index + 1, brief.topic, wordCount),
      claimIds: claim === undefined ? [] : [claim.claimId],
      estDurationSec: seconds,
    };
  });
  return {
    title: brief.topic.slice(0, 120),
    hook: `Roteiro simulado: ${brief.topic}`.slice(0, 300),
    scenes,
    totalEstDurationSec: seconds * sceneCount,
  };
}

type SceneVisual = ScenesOutput['scenes'][number]['visual'];

/** One scene per script scene, on its capture when there is one, citing nothing it was not offered. */
function mockScenes(packet: DirectorPacket): ScenesOutput {
  const cameraMove = packet.constraints.cameraMoves[0] ?? 'static';
  const transition = packet.constraints.transitions[0] ?? 'cut';
  const scenes = packet.inputs.script.scenes.map((scene, index) => {
    const capture = packet.inputs.capturesIndex[index];
    const visual: SceneVisual =
      capture === undefined
        ? { type: TITLE_CARD_VISUAL, text: (scene.onScreenText ?? scene.sceneId).slice(0, 80) }
        : { type: CAPTURE_VISUAL, captureId: capture.captureId, inMs: 0, outMs: capture.durationMs };
    return { sceneId: scene.sceneId, visual, cameraMove, transition };
  });
  return { scenes, citedRefs: [] };
}

/** Scores every rubric criterion 4 with evidence and recommends no retry. */
function mockVerdict(packet: ReviewPacket): ReviewVerdict {
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

/** Mock Recovery fixes nothing: it hands the failure to the owner. */
function mockRecovery(packet: RecoveryPacket): RecoveryAction {
  return {
    resolved: false,
    cause: `Modo simulado: a etapa ${packet.inputs.failedStep.stageId} não é corrigida automaticamente.`,
    action: { kind: NEEDS_PERSON_ACTION },
    whatWasDone: 'Nada; o modo simulado não aplica correções.',
    needsPerson: true,
    whatToDo: 'Rode de novo sem o cenário de falha ou verifique a etapa.',
  };
}

type MockResponders = { [Role in ModelRoleName]: (packet: AgentPacket<Role>) => AgentOutput<Role> };

export const mockResponders: MockResponders = {
  [PLANNER_ROLE]: mockPlan,
  [WRITER_ROLE]: mockScript,
  [DIRECTOR_ROLE]: mockScenes,
  [EVALUATOR_ROLE]: mockVerdict,
  [RECOVERY_ROLE]: mockRecovery,
};
