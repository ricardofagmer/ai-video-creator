import { z } from 'zod';
import { RunIdSchema } from '../common/ids';
import { StageIdSchema } from '../run-format/vocabulary';

/** Per-call budget; the numbers come from `agentBounds` (topology section 7). */
export const BudgetSchema = z
  .object({
    maxTokens: z.number().int().positive(),
    maxToolCalls: z.number().int().min(0),
    timeoutMs: z.number().int().positive(),
    maxUsd: z.number().positive(),
  })
  .strict()
  .readonly();
export type Budget = z.infer<typeof BudgetSchema>;

/**
 * Topology section 5 `PacketBase`: the fields every packet spreads in. Single user, so the scope
 * is the run; there is no tenant id. The engine binds `runId`, never a model.
 */
export const packetBaseShape = {
  runId: RunIdSchema,
  stageId: StageIdSchema,
  attempt: z.number().int().min(1),
  budget: BudgetSchema,
};

export const PacketBaseSchema = z.object(packetBaseShape).strict().readonly();
export type PacketBase = z.infer<typeof PacketBaseSchema>;
