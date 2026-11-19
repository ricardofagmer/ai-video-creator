import { z } from 'zod';

/**
 * `limits.*` of a run (PRD concept map, eng-grafo `limites`). Every run.json carries the full,
 * resolved set; a recipe carries only overrides.
 */
export const LimitsSchema = z
  .object({
    /** Executions of one step, recovery reruns included (topology section 7). */
    attemptsPerStep: z.number().int().min(1).max(10),
    /** Recovery calls per stage (SPEC 0002 A7, K3); one per failed step attempt on top. */
    recoveriesPerStage: z.number().int().min(0).max(20),
    /** Evaluator revisions per generator stage (topology section 7: 2 revisions, 3 attempts). */
    revisionsPerStage: z.number().int().min(0).max(5),
    /** Wall clock of one toolbox command (SPEC 0002 A7: 15 min; the local voice needs more). */
    commandTimeoutMs: z.number().int().min(1000).max(4 * 60 * 60 * 1000),
    /** D11 ceilings; reaching either puts the run in `waiting`. */
    costPerRunUsd: z.number().nonnegative().max(1000),
    costPerMonthUsd: z.number().nonnegative().max(10000),
  })
  .strict();
export type Limits = z.infer<typeof LimitsSchema>;

export const defaultLimits: Readonly<Limits> = {
  attemptsPerStep: 3,
  recoveriesPerStage: 4,
  revisionsPerStage: 2,
  commandTimeoutMs: 15 * 60 * 1000,
  costPerRunUsd: 3,
  costPerMonthUsd: 60,
};

export const LimitsOverrideSchema = LimitsSchema.partial();
export type LimitsOverride = z.infer<typeof LimitsOverrideSchema>;

/** Defaults, then the recipe's overrides, then the run's own overrides; later wins. */
export function resolveLimits(...overrides: readonly LimitsOverride[]): Limits {
  return overrides.reduce<Limits>(
    (resolved, override) => ({
      attemptsPerStep: override.attemptsPerStep ?? resolved.attemptsPerStep,
      recoveriesPerStage: override.recoveriesPerStage ?? resolved.recoveriesPerStage,
      revisionsPerStage: override.revisionsPerStage ?? resolved.revisionsPerStage,
      commandTimeoutMs: override.commandTimeoutMs ?? resolved.commandTimeoutMs,
      costPerRunUsd: override.costPerRunUsd ?? resolved.costPerRunUsd,
      costPerMonthUsd: override.costPerMonthUsd ?? resolved.costPerMonthUsd,
    }),
    { ...defaultLimits },
  );
}
