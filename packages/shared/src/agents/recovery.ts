import { z } from 'zod';
import { StageIdSchema, StepNameSchema } from '../run-format/vocabulary';
import { packetBaseShape } from './packet-base';
import { StepParamsPatchSchema } from './packet-parts';
import {
  NEEDS_PERSON_ACTION,
  OutputContractSchema,
  RECOVER_STEP_TASK,
  RERUN_PREVIOUS_STAGE_ACTION,
  RETRY_STEP_ACTION,
  RETRY_WITH_PARAMS_ACTION,
  RecoveryActionKindSchema,
} from './protocol';

/**
 * Recovery packet (topology section 5). Absent by construction: full session streams (it reads a
 * redacted events tail through RunArtifactReadTool), biometric content, credentials.
 */
export const RecoveryPacketSchema = z
  .object({
    ...packetBaseShape,
    task: z.literal(RECOVER_STEP_TASK),
    inputs: z
      .object({
        failedStep: z
          .object({
            stageId: StageIdSchema,
            step: StepNameSchema,
            attempt: z.number().int(),
            postcondition: z.string(),
            /** Redacted by the engine before the packet is built. */
            failureReason: z.string().max(2000),
          })
          .strict(),
        /** Subset of the protocol allowlist the engine permits for this step. */
        allowedActions: z.array(RecoveryActionKindSchema),
      })
      .strict(),
    constraints: z
      .object({
        oneFixOnly: z.literal(true),
        /** PRD 7.3. */
        neverRetryBiometric: z.literal(true),
      })
      .strict(),
    outputContract: z.literal(OutputContractSchema.enum.RecoveryAction),
  })
  .strict()
  .readonly();
export type RecoveryPacket = z.infer<typeof RecoveryPacketSchema>;

/**
 * Recovery answer: the ADR 0002 shape extended with `action`. Recovery applies nothing; the engine
 * checks `action.kind` against the packet's `allowedActions` and applies it.
 */
export const RecoveryActionSchema = z
  .object({
    resolved: z.boolean(),
    cause: z.string().max(500),
    action: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal(RETRY_STEP_ACTION) }).strict(),
      /** Keys are allowlisted per step by the engine. */
      z.object({ kind: z.literal(RETRY_WITH_PARAMS_ACTION), params: StepParamsPatchSchema }).strict(),
      z.object({ kind: z.literal(RERUN_PREVIOUS_STAGE_ACTION), stageId: StageIdSchema }).strict(),
      z.object({ kind: z.literal(NEEDS_PERSON_ACTION) }).strict(),
    ]),
    whatWasDone: z.string().max(500),
    needsPerson: z.boolean(),
    /** Shown to the owner when `needsPerson`. */
    whatToDo: z.string().max(500),
  })
  .strict();
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;
