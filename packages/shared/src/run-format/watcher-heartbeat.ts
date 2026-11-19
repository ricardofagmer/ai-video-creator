import { z } from 'zod';
import { IsoDateTimeSchema } from '../common/ids';

/**
 * `<data home>/logs/watcher.heartbeat.json` (SPEC 0002 rev 4, section 13.3; ADR 0003 rev 4
 * addition). A data-home file, not a run file. Single writer: the watcher daemon, through
 * `writeWatcherHeartbeat` (C5). Holds no pid, no run id and no path; strict, so none can be added.
 */
export const WatcherHeartbeatSchema = z
  .object({
    format: z.literal(1),
    at: IsoDateTimeSchema,
  })
  .strict();
export type WatcherHeartbeat = z.infer<typeof WatcherHeartbeatSchema>;

/** File name inside the data home's `logs/` folder. */
export const watcherHeartbeatFileName = 'watcher.heartbeat.json';

/** One write at daemon start, then one every 2 s on a timer independent of the run loop (A19). */
export const WATCHER_HEARTBEAT_INTERVAL_MS = 2000;

/** A heartbeat older, or dated further in the future, than this reads `dead` (A19, A20). */
export const WATCHER_HEARTBEAT_STALE_AFTER_MS = 10000;
