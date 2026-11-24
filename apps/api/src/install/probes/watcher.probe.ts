import { Injectable } from '@nestjs/common';
import { type ComponentState, type WatcherStatusResponse } from '@studio/shared/api';
import { WatcherStatusReader } from '../../watcher/watcher-status.reader';

/** `alive` is `ok`; a stale or unreadable heartbeat (`dead`) or none yet (`absent`) is `stopped`. */
export function watcherComponentState(status: WatcherStatusResponse): ComponentState {
  return status.state === 'alive' ? 'ok' : 'stopped';
}

/**
 * The watcher daemon, judged by the same heartbeat reader as `GET /watcher` (no process is
 * inspected or signalled). `lastSeenAt` is dropped: C1 carries the state only.
 */
@Injectable()
export class WatcherProbe {
  constructor(private readonly reader: WatcherStatusReader) {}

  async probe(): Promise<ComponentState> {
    return watcherComponentState(await this.reader.read());
  }
}
