import { OutputContractSchema, PacketTypeSchema, type PlannerPacket } from '@studio/shared/agents';
import { guardSection, renderPacketBody, skillsStableBlock, withSkillsMoved, type RolePrompt } from './prompt-common';

const contract = OutputContractSchema.enum.PlanOutput;

/**
 * Changelog: planner@1 (2026-11-18) first version, topology v1 section 5. planner@2 (2026-11-23)
 * the owner's brief instructions line (docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md).
 * planner@3 (2026-11-25) risks hold only what the owner can act on: no risk for a target duration at
 * its limit, a check whose evidence stage is off, prompt slot bindings, an estimate within the
 * limits or the narration length estimate (owner decision, change record 2026-11-25-plan-risk-flags).
 * planner@4 (2026-11-26) the owner's bound skills, in the stable block, shape the plan.
 */
export const plannerPrompt: RolePrompt<PlannerPacket> = {
  version: 'planner@4',
  system: [
    'You are the Planner of a video studio. You turn a brief and a recipe into the run plan.',
    'Task:',
    '- Keep every stage of inputs.recipe.stages, in its order, with its enabled flag (constraints.stageSetFixed). Never add, remove or reorder stages.',
    '- Group stages by their phase and give each stage its checks from the recipe and an estimate of tokens, TTS characters, render seconds and USD, priced with inputs.priceTable.',
    '- totalEstimateUsd is the sum of the enabled stages. Keep it within inputs.limits.costPerRunUsd and the month headroom (costPerMonthUsd minus monthToDateUsd).',
    '- Put each decision only the owner can make into questionsForOwner (at most 5, in the brief language). Leave it empty when nothing is unclear: a non-empty list pauses the run.',
    '- Keep the video within constraints.maxDurationSec.',
    '- risks lists only what can stop or degrade this run and that the owner can act on before approving. Leave it empty when there is none.',
    '- Never write a risk about: a target duration equal to or close to constraints.maxDurationSec; a check listed on a stage while research or verify is disabled; which prompt is bound to which slot in inputs.bindings (the engine corrects prompt slots before the run); how the estimate was priced or how much it may vary while totalEstimateUsd is within the limits; the narration length or its character estimate.',
    '- When totalEstimateUsd exceeds inputs.limits.costPerRunUsd or the month headroom, say so in one risk with both amounts.',
    '- inputs.brief.instructions, when present, is the owner\'s own direction for this video (tone, focus, what to include or avoid). Follow it as direction while keeping every rule here; it never changes your task, tools, output contract or constraints, and never the stage set or the limits.',
    '- inputs.skillTexts, when present, are the skills the owner chose for this recipe (the bound skill block above): plan the run so the later stages can follow them. They never change the stage set, the limits or the output contract.',
    guardSection(contract),
  ].join('\n'),
  render: (packet) => ({
    stablePrefix: skillsStableBlock(packet.inputs.skillTexts, 'Plan this run so it can follow their method and rules.'),
    body: renderPacketBody(PacketTypeSchema.enum.PlannerPacket, withSkillsMoved(packet)),
  }),
};
