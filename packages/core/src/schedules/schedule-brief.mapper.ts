import { type ScheduleBriefInput } from '@studio/shared/api';
import { newUlid } from '@studio/shared/run-files';
import { UlidSchema, type ScheduleBrief } from '@studio/shared/schedules';

/**
 * Submitted briefs to `schedule.json` briefs: the server assigns each `briefId` (C10 rev 5
 * `ScheduleBriefInputSchema`). ULIDs of one instant still differ in their 80 random bits.
 */
export function toScheduleBriefs(briefs: readonly ScheduleBriefInput[], now: Date): ScheduleBrief[] {
  return briefs.map(
    (input): ScheduleBrief => ({
      briefId: UlidSchema.parse(newUlid(now.getTime())),
      brief: input.brief,
      references: [...input.references],
      ...(input.title === undefined ? {} : { title: input.title }),
    }),
  );
}
