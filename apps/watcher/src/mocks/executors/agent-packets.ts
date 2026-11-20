import {
  DIRECT_SCENES_TASK,
  OutputContractSchema,
  PLAN_RUN_TASK,
  REVIEW_TASK,
  UNTRUSTED_TAG,
  WRITE_SCRIPT_TASK,
  agentBounds,
  wrapDelimited,
  type BindingSummary,
  type Budget,
  type DirectorPacket,
  type ModelRoleName,
  type PlannerPacket,
  type RecipeSummary,
  type ReviewPacket,
  type RunArtifactId,
  type ScriptOutput,
  type WriterPacket,
} from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { recipeRefOf, type Recipe } from '@studio/shared/recipes';
import { stagePhase, type PhaseId, type QaMetrics, type ReviewSubject } from '@studio/shared/run-format';
import { mockBrandKitSummary, mockTemplateMotion, findMockCatalogEntry } from '../fixtures/catalog.fixtures';
import { type MockStageTools } from './mock-stage-behaviour';

/**
 * Packet builders for the mock stages, following topology section 5. They are the shape R1-14's
 * builders must produce; `MockAgentsService` parses each packet with its C7 schema.
 */

const BRIEF_SUMMARY_MAX = 1000;

const reviewArtifacts: Readonly<Record<ReviewSubject, readonly RunArtifactId[]>> = {
  script: ['brief', 'script'],
  scenes: ['brief', 'script', 'scenes', 'captures-index'],
  render: ['brief', 'scenes', 'qa-metrics', 'checks'],
};

function budgetOf(role: ModelRoleName): Budget {
  const bounds = agentBounds[role];
  return { maxTokens: bounds.maxTokens, maxToolCalls: bounds.maxToolCalls, timeoutMs: bounds.timeoutMs, maxUsd: bounds.maxUsd };
}

function packetBase(context: StageExecutionContext, role: ModelRoleName): Pick<PlannerPacket, 'runId' | 'stageId' | 'attempt' | 'budget'> {
  return { runId: context.runId, stageId: context.stage.stageId, attempt: context.attempt, budget: budgetOf(role) };
}

/** Bound assets by slot; biometric rows never reach a packet (topology section 2). */
function bindingSummaries(context: StageExecutionContext): BindingSummary[] {
  return context.recipe.bindings.flatMap((binding) => {
    const asset = context.assets.find((candidate) => candidate.ref === binding.ref);
    if (asset === undefined || asset.sensitivity === 'biometric') return [];
    return [{ slot: binding.slot, ref: binding.ref, kind: asset.kind, title: findMockCatalogEntry(binding.ref)?.title ?? binding.ref }];
  });
}

function recipeSummary(recipe: Recipe): RecipeSummary {
  const phases = [...new Set(recipe.graph.stages.map((stage): PhaseId => stagePhase[stage.stageId]))];
  return {
    ref: recipeRefOf(recipe),
    phases,
    stages: recipe.graph.stages.map((stage) => ({ stageId: stage.stageId, enabled: stage.enabled, checks: [...stage.checks] })),
    inputs: recipe.inputs,
    rubricRef: recipeRefOf(recipe),
  };
}

function delimitedTextOf(context: StageExecutionContext, slot: string): string | undefined {
  const binding = context.recipe.bindings.find((candidate) => candidate.slot === slot);
  const entry = binding === undefined ? undefined : findMockCatalogEntry(binding.ref);
  return entry === undefined || entry.text.length === 0 ? undefined : wrapDelimited(UNTRUSTED_TAG, entry.text, { ref: entry.ref });
}

export async function plannerPacket(context: StageExecutionContext, tools: MockStageTools): Promise<PlannerPacket> {
  return {
    ...packetBase(context, 'planner'),
    task: PLAN_RUN_TASK,
    inputs: {
      brief: context.brief,
      recipe: recipeSummary(context.recipe),
      bindings: bindingSummaries(context),
      priceTable: { models: [], tts: [], renderUsdPerSecond: 0 },
      limits: {
        costPerRunUsd: context.limits.costPerRunUsd,
        costPerMonthUsd: context.limits.costPerMonthUsd,
        monthToDateUsd: await tools.ledger.monthToDateUsd(),
      },
    },
    constraints: { stageSetFixed: true, maxDurationSec: Math.max(1, Math.floor(context.recipe.format.duration.maxSec)) },
    outputContract: OutputContractSchema.enum.PlanOutput,
  };
}

export function writerPacket(context: StageExecutionContext, verifiedClaims: WriterPacket['inputs']['verifiedClaims']): WriterPacket {
  const promptText = delimitedTextOf(context, 'prompt:writer') ?? wrapDelimited(UNTRUSTED_TAG, 'Escreva o roteiro.');
  const brandVoice = delimitedTextOf(context, 'brand-kit');
  return {
    ...packetBase(context, 'writer'),
    task: WRITE_SCRIPT_TASK,
    inputs: {
      brief: context.brief,
      verifiedClaims,
      templateInputSchema: {},
      promptText,
      ...(brandVoice === undefined ? {} : { brandVoice }),
      targetDurationSec: context.brief.targetDurationSec,
      language: context.brief.language,
      // Required block, `[]` when none (topology 0004 section 4): the mock catalog carries no notes.
      learnings: [],
    },
    constraints: {
      claimsOnly: true,
      maxWordsPerSecond: context.recipe.format.narration.maxWordsPerSecond,
      sceneCount: context.recipe.format.sceneCount,
    },
    outputContract: OutputContractSchema.enum.ScriptOutput,
  };
}

export function directorPacket(
  context: StageExecutionContext,
  script: ScriptOutput,
  capturesIndex: DirectorPacket['inputs']['capturesIndex'],
): DirectorPacket {
  return {
    ...packetBase(context, 'director'),
    task: DIRECT_SCENES_TASK,
    inputs: {
      script,
      capturesIndex,
      templateSceneSchema: {},
      offeredRefs: bindingSummaries(context),
      brandKit: mockBrandKitSummary,
      // Required block, `[]` when none (topology 0004 section 4): the mock catalog carries no notes.
      learnings: [],
    },
    constraints: {
      citeOnlyOfferedRefs: true,
      cameraMoves: mockTemplateMotion.cameraMoves,
      transitions: mockTemplateMotion.transitions,
    },
    outputContract: OutputContractSchema.enum.ScenesOutput,
  };
}

export function reviewPacket(context: StageExecutionContext, subject: ReviewSubject, qaMetrics?: QaMetrics): ReviewPacket {
  const brief = context.brief;
  const briefSummary = `${brief.topic}. Mensagens: ${brief.keyMessages.join('; ')}`.slice(0, BRIEF_SUMMARY_MAX);
  return {
    ...packetBase(context, 'evaluator'),
    task: REVIEW_TASK,
    inputs: {
      subject,
      rubric: context.recipe.rubric
        .filter((criterion) => criterion.subjects.includes(subject))
        .map((criterion) => ({
          criterionId: criterion.criterionId,
          description: criterion.description,
          weight: criterion.weight,
          threshold: criterion.threshold,
        })),
      briefSummary,
      artifactIds: [...reviewArtifacts[subject]],
      ...(qaMetrics === undefined ? {} : { qaMetrics }),
    },
    constraints: { evidenceRequired: true, passDecisionIsEngines: true },
    outputContract: OutputContractSchema.enum.ReviewVerdict,
  };
}
