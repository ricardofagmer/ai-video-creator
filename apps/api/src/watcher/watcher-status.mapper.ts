import { type WatcherStatusResponse } from '@studio/shared/api';
import { type OptionalFile } from '@studio/shared/run-files';
import { WATCHER_HEARTBEAT_STALE_AFTER_MS, type WatcherHeartbeat } from '@studio/shared/run-format';

/** What reading the heartbeat file produced: a typed optional file, or a failed read (A20). */
export type HeartbeatReading = { outcome: 'read'; file: OptionalFile<WatcherHeartbeat> } | { outcome: 'unreadable' };

const DEAD_UNKNOWN: WatcherStatusResponse = { state: 'dead', lastSeenAt: null };

/**
 * The freshness table of SPEC 0002 rev 4, section 13.3, with `window` =
 * `WATCHER_HEARTBEAT_STALE_AFTER_MS`. Judged from the content timestamp only, never from mtime or a
 * process (A19); every broken case fails closed to `dead` (A20).
 */
export function toWatcherStatus(reading: HeartbeatReading, nowMs: number): WatcherStatusResponse {
  if (reading.outcome === 'unreadable') return DEAD_UNKNOWN;
  if (reading.file.status === 'absent') return { state: 'absent', lastSeenAt: null };
  const { at } = reading.file.value;
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return DEAD_UNKNOWN;
  if (atMs - nowMs > WATCHER_HEARTBEAT_STALE_AFTER_MS) return DEAD_UNKNOWN;
  if (nowMs - atMs > WATCHER_HEARTBEAT_STALE_AFTER_MS) return { state: 'dead', lastSeenAt: at };
  return { state: 'alive', lastSeenAt: at };
}
