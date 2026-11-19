import type { z } from 'zod';
import { DirectorPacketSchema, ScenesOutputSchema } from './director';
import { PlanOutputSchema, PlannerPacketSchema } from './planner';
import {
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  PacketTypeSchema,
  RECOVERY_ROLE,
  WRITER_ROLE,
  type ModelRoleName,
  type PacketType,
} from './protocol';
import { RecoveryActionSchema, RecoveryPacketSchema } from './recovery';
import { ReviewPacketSchema, ReviewVerdictSchema } from './reviewer';
import { ScriptOutputSchema, WriterPacketSchema } from './writer';

interface RoleContract {
  readonly packetType: PacketType;
  readonly packet: z.ZodTypeAny;
  readonly output: z.ZodTypeAny;
}

/**
 * Role -> packet and output schemas, one row per hop of topology section 4. `AgentsService.run`
 * parses with `output` (structured output) and the engine with `packet`; `AgentsPort` derives its
 * types from this map so the output type always follows the role.
 */
export const agentContracts = {
  [PLANNER_ROLE]: {
    packetType: PacketTypeSchema.enum.PlannerPacket,
    packet: PlannerPacketSchema,
    output: PlanOutputSchema,
  },
  [WRITER_ROLE]: {
    packetType: PacketTypeSchema.enum.WriterPacket,
    packet: WriterPacketSchema,
    output: ScriptOutputSchema,
  },
  [DIRECTOR_ROLE]: {
    packetType: PacketTypeSchema.enum.DirectorPacket,
    packet: DirectorPacketSchema,
    output: ScenesOutputSchema,
  },
  [EVALUATOR_ROLE]: {
    packetType: PacketTypeSchema.enum.ReviewPacket,
    packet: ReviewPacketSchema,
    output: ReviewVerdictSchema,
  },
  [RECOVERY_ROLE]: {
    packetType: PacketTypeSchema.enum.RecoveryPacket,
    packet: RecoveryPacketSchema,
    output: RecoveryActionSchema,
  },
} satisfies Readonly<Record<ModelRoleName, RoleContract>>;

export type AgentContracts = typeof agentContracts;
