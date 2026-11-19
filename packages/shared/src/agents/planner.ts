import { z } from 'zod';
import { BriefSchema } from '../recipes/brief';
import { StageEstimateSchema } from '../run-format/stage-record';
import { CheckIdSchema, PhaseIdSchema, StageIdSchema } from '../run-format/vocabulary';
import { packetBaseShape } from './packet-base';
import { BindingSummarySchema, PriceTableSummarySchema, RecipeSummarySchema } from './packet-parts';
import { OutputContractSchema, PLAN_RUN_TASK } from './protocol';

/**
 * Planner packet (topology section 5). Absent by construction: asset bytes, biometric rows,
 * credentials, other runs' state.
 */
export const PlannerPacketSchema = z
  .object({
    ...packetBaseShape,
    task: z.literal(PLAN_RUN_TASK),
    inputs: z
      .object({
        brief: BriefSchema,
        recipe: RecipeSummarySchema,
        bindings: z.array(BindingSummarySchema),
        priceTable: PriceTableSummarySchema,
        limits: z
          .object({ costPerRunUsd: z.number(), costPerMonthUsd: z.number(), monthToDateUsd: z.number() })
          .strict(),
      })
      .strict(),
    constraints: z
      .object({
        /** The Planner may not add or reorder stages. */
        stageSetFixed: z.literal(true),
        maxDurationSec: z.number().int().positive(),
      })
      .strict(),
    outputContract: z.literal(OutputContractSchema.enum.PlanOutput),
  })
  .strict()
  .readonly();
export type PlannerPacket = z.infer<typeof PlannerPacketSchema>;

/** Planner answer. A non-empty `questionsForOwner` makes the engine set `waiting`. */
export const PlanOutputSchema = z
  .object({
    phases: z.array(
      z
        .object({
          id: PhaseIdSchema,
          stages: z.array(
            z
              .object({
                stageId: StageIdSchema,
                enabled: z.boolean(),
                checks: z.array(CheckIdSchema),
                /** Same fields as the topology estimate; the R1-02 schema adds non-negative bounds. */
                estimate: StageEstimateSchema,
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    totalEstimateUsd: z.number(),
    risks: z.array(z.string().max(300)).max(10),
    questionsForOwner: z.array(z.string().max(300)).max(5),
  })
  .strict();
export type PlanOutput = z.infer<typeof PlanOutputSchema>;
