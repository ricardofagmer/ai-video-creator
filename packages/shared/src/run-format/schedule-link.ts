import { z } from 'zod';
import { IsoDateTimeSchema, ScheduleIdSchema, UlidSchema } from '../common/ids';

export { ScheduleIdSchema, type ScheduleId } from '../common/ids';

/**
 * `run.json.schedule` (SPEC 0006 section 4.3): present exactly on a run the watcher created from a
 * due slot of a schedule (`createdBy: 'watcher'`), absent on every other run, so every rev 4 run
 * folder still validates and `format` stays 1 (SPEC 0006 L2). The watcher writes it once, when it
 * creates the run at `pending`; nothing rewrites it. `slotAt` and `scheduleId` together identify
 * the slot, which lets a restarted watcher find a run it created before a crash (section 5.6).
 */
export const RunScheduleLinkSchema = z
  .object({
    scheduleId: ScheduleIdSchema,
    slotAt: IsoDateTimeSchema,
    briefId: UlidSchema,
  })
  .strict();
export type RunScheduleLink = z.infer<typeof RunScheduleLinkSchema>;
