import { Injectable, Logger } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { type WatcherStatusResponse } from '@studio/shared/api';
import { readWatcherHeartbeat } from '@studio/shared/run-files';
import { toWatcherStatus, type HeartbeatReading } from './watcher-status.mapper';

/**
 * Daemon-wide watcher state for `GET /watcher` (SPEC 0002 rev 4, section 13.3). It reads only
 * `<data home>/logs/watcher.heartbeat.json` through the C5 helper. It never signals or inspects a
 * process, never reads a pid file, and the response never carries a pid.
 */
@Injectable()
export class WatcherStatusReader {
  private readonly logger = new Logger(WatcherStatusReader.name);

  constructor(private readonly dataHome: DataHome) {}

  async read(): Promise<WatcherStatusResponse> {
    return toWatcherStatus(await this.readHeartbeat(), Date.now());
  }

  private async readHeartbeat(): Promise<HeartbeatReading> {
    try {
      return { outcome: 'read', file: await readWatcherHeartbeat(this.dataHome.logs) };
    } catch (error) {
      // A20: any failed read (link, oversized, invalid JSON or schema, I/O) reads `dead`. Only the
      // error name is logged: run-file error messages name the file.
      this.logger.warn({ event: 'watcher.heartbeat-unreadable', errorName: error instanceof Error ? error.name : 'unknown' });
      return { outcome: 'unreadable' };
    }
  }
}
