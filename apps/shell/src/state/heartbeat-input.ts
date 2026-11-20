import { readWatcherHeartbeat } from '@studio/shared/run-files';

/** What the heartbeat file said; freshness is decided by the state model against the injected clock. */
export type HeartbeatInput = { kind: 'absent' } | { kind: 'present'; at: string } | { kind: 'unreadable' };

/**
 * Reads `<logs>/watcher.heartbeat.json` through the shared reader, which refuses links, files over
 * 1 KiB, invalid JSON, a newer format and schema mismatches by throwing. Every such throw reads
 * `unreadable`, which the model shows as `dead`, the same mapping the api uses (A20).
 */
export async function readHeartbeatInput(logsDirectory: string): Promise<HeartbeatInput> {
  try {
    const heartbeat = await readWatcherHeartbeat(logsDirectory);
    return heartbeat.status === 'absent' ? { kind: 'absent' } : { kind: 'present', at: heartbeat.value.at };
  } catch {
    return { kind: 'unreadable' };
  }
}
