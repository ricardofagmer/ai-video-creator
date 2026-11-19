import { z } from 'zod';
import { IsoDateTimeSchema } from '../common/ids';

/**
 * `GET /watcher` (SPEC 0002 rev 4, section 13.3): whether the watcher daemon is running, judged
 * only from `<data home>/logs/watcher.heartbeat.json`. Behind the session guard. With `now` the
 * server clock and the window `WATCHER_HEARTBEAT_STALE_AFTER_MS` (10 s):
 *
 * | Heartbeat file | `state` | `lastSeenAt` |
 * |---|---|---|
 * | missing | `absent` | `null` |
 * | valid, `now - at <= window` and `at - now <= window` | `alive` | `at` |
 * | valid, older than the window | `dead` | `at` |
 * | valid, dated more than the window in the future | `dead` | `null` |
 * | unreadable or invalid | `dead` | `null` |
 *
 * Strict and without a `pid` key: the api never signals or inspects a process for this route, and
 * the response never carries a pid. The per-run `RunStateResponse.watcher` field is unrelated.
 */
export const WatcherStatusResponseSchema = z
  .object({
    state: z.enum(['alive', 'dead', 'absent']),
    lastSeenAt: IsoDateTimeSchema.nullable(),
  })
  .strict();
export type WatcherStatusResponse = z.infer<typeof WatcherStatusResponseSchema>;
