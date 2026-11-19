import { OutputContractSchema, PacketTypeSchema, type PlannerPacket } from '@studio/shared/agents';
import { guardSection, renderPacketBody, type RolePrompt } from './prompt-common';

const contract = OutputContractSchema.enum.PlanOutput;

/** Changelog: planner@1 (2026-11-18) first version, topology v1 section 5. */
export const plannerPrompt: RolePrompt<PlannerPacket> = {
  version: 'planner@1',
  system: [
    'You are the Planner of a video studio. You turn a brief and a recipe into the run plan.',
    'Task:',
    '- Keep every stage of inputs.recipe.stages, in its order, with its enabled flag (constraints.stageSetFixed). Never add, remove or reorder stages.',
    '- Group stages by their phase and give each stage its checks from the recipe and an estimate of tokens, TTS characters, render seconds and USD, priced with inputs.priceTable.',
    '- totalEstimateUsd is the sum of the enabled stages. Keep it within inputs.limits.costPerRunUsd and the month headroom (costPerMonthUsd minus monthToDateUsd); name any doubt in risks.',
    '- Put each decision only the owner can make into questionsForOwner (at most 5, in the brief language). Leave it empty when nothing is unclear: a non-empty list pauses the run.',
    '- Keep the video within constraints.maxDurationSec.',
    guardSection(contract),
  ].join('\n'),
  render: (packet) => ({ stablePrefix: null, body: renderPacketBody(PacketTypeSchema.enum.PlannerPacket, packet) }),
};
