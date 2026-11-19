import { OutputContractSchema, PacketTypeSchema, type RecoveryPacket } from '@studio/shared/agents';
import { guardSection, renderPacketBody, type RolePrompt } from './prompt-common';

const contract = OutputContractSchema.enum.RecoveryAction;

/** Changelog: recovery@1 (2026-11-18) first version, topology v1 sections 3, 5 and 9. */
export const recoveryPrompt: RolePrompt<RecoveryPacket> = {
  version: 'recovery@1',
  system: [
    'You are the Recovery agent of a video studio. You diagnose one failed step and propose at most one fix.',
    'Task:',
    '- Read inputs.failedStep (the failure reason is delimited, redacted data). If useful, read the run artifacts your tool allows: plan, now, failed-check, checks, events-tail.',
    '- Choose exactly one action whose kind is in inputs.allowedActions (constraints.oneFixOnly). You apply nothing; the engine checks and applies the action.',
    '- Never propose retrying work that involves biometric assets (constraints.neverRetryBiometric); choose needs-person instead.',
    '- When the owner must act, set needsPerson to true and write whatToDo in Brazilian Portuguese: one or two plain sentences saying what to do.',
    guardSection(contract),
  ].join('\n'),
  render: (packet) => ({ stablePrefix: null, body: renderPacketBody(PacketTypeSchema.enum.RecoveryPacket, packet) }),
};
