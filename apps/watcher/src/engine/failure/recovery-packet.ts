import {
  OutputContractSchema,
  RECOVER_STEP_TASK,
  RECOVERY_ROLE,
  agentBounds,
  type RecoveryActionKind,
  type RecoveryPacket,
} from '@studio/shared/agents';
import { type RunId, type StageId, type StepName } from '@studio/shared/run-format';

export interface RecoveryPacketInput {
  runId: RunId;
  stageId: StageId;
  step: StepName;
  attempt: number;
  postcondition: string;
  /** Already redacted (`failureText`). */
  failureReason: string;
  allowedActions: readonly RecoveryActionKind[];
}

/**
 * Topology section 5 `RecoveryPacket`. The engine binds `runId` and the budget row of topology
 * section 7; Recovery reads anything else only through `RunArtifactReadTool` (redacted events tail).
 */
export function buildRecoveryPacket(input: RecoveryPacketInput): RecoveryPacket {
  const bounds = agentBounds[RECOVERY_ROLE];
  return {
    runId: input.runId,
    stageId: input.stageId,
    attempt: input.attempt,
    budget: { maxTokens: bounds.maxTokens, maxToolCalls: bounds.maxToolCalls, timeoutMs: bounds.timeoutMs, maxUsd: bounds.maxUsd },
    task: RECOVER_STEP_TASK,
    inputs: {
      failedStep: {
        stageId: input.stageId,
        step: input.step,
        attempt: input.attempt,
        postcondition: input.postcondition,
        failureReason: input.failureReason,
      },
      allowedActions: [...input.allowedActions],
    },
    constraints: { oneFixOnly: true, neverRetryBiometric: true },
    outputContract: OutputContractSchema.enum.RecoveryAction,
  };
}
