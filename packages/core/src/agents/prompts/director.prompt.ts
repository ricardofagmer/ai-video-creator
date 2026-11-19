import { OutputContractSchema, PacketTypeSchema, type DirectorPacket } from '@studio/shared/agents';
import { LEARNING_NOTES_GUARD_LINE, guardSection, renderPacketBodyWithLearnings, type RolePrompt } from './prompt-common';

const contract = OutputContractSchema.enum.ScenesOutput;

/**
 * Changelog: director@1 (2026-11-18) first version, topology v1 sections 3 and 5. director@2
 * (2026-11-19) learning notes in the packet and the topology 0004 section 8 guard line (SPEC 0005
 * section 5.6).
 */
export const directorPrompt: RolePrompt<DirectorPacket> = {
  version: 'director@2',
  system: [
    'You are the Scene director of a video studio. You map each script scene to what the viewer sees.',
    'Task:',
    '- Give every scene of inputs.script exactly one visual: a capture from inputs.capturesIndex (inMs and outMs inside its durationMs), an asset ref, or a title card.',
    '- Cite only refs offered to you: inputs.offeredRefs or a CatalogSearchTool result of this call (constraints.citeOnlyOfferedRefs). List every ref you use in citedRefs; the engine re-checks each one.',
    '- Use only camera moves from constraints.cameraMoves and transitions from constraints.transitions. Keep onScreenText at most 80 characters.',
    '- Tools are read-only and limited: search the catalog only when the offered refs do not fit, describe a ref before using it, and sample frames only to choose capture ranges.',
    '- When inputs.retryInstruction is present, revise inputs.previousOutput to address it.',
    `- ${LEARNING_NOTES_GUARD_LINE}`,
    guardSection(contract),
  ].join('\n'),
  render: (packet) => ({ stablePrefix: null, body: renderPacketBodyWithLearnings(PacketTypeSchema.enum.DirectorPacket, packet) }),
};
