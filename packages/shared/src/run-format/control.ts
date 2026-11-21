import { z } from 'zod';
import { CorrelationIdSchema, EpochMsSchema } from '../common/ids';

/**
 * `runs/<runId>/control.json`: request channel from the api or CLI to the watcher
 * (ADR 0003 `{ pause, stop, at }`, plus the optional `resume` flag of SPEC 0002 A6).
 * - `pause`: finish the current step, then `paused`. Writing `pause: false` cancels a pause.
 * - `stop`: kill the current step, leave it `pending`, run `interrupted`. `stop` wins over `pause`.
 * - `resume`: written only while no watcher is alive; the daemon picks the run up again.
 * The watcher reads it between steps and deletes it when an execution starts.
 */
export const ControlRequestSchema = z
  .object({
    pause: z.boolean(),
    stop: z.boolean(),
    at: EpochMsSchema,
    resume: z.boolean().optional(),
    correlationId: CorrelationIdSchema.optional(),
  })
  .strict();
export type ControlRequest = z.infer<typeof ControlRequestSchema>;
