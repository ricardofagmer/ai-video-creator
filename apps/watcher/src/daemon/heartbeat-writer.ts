import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { writeWatcherHeartbeat } from '@studio/shared/run-files';
import { WATCHER_HEARTBEAT_INTERVAL_MS } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { HEARTBEAT_WARNING_MIN_GAP_MS } from './daemon.settings';

const ERROR_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

interface HeartbeatOutage {
  failedBeats: number;
  /** False when the warning was held back by the rate limit; the recovery line is then held back too. */
  reported: boolean;
}

/** The errno or C5 code only (`ENOSPC`, `write-failed`); a message can quote the data-home path. */
function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  return typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Writes `<data home>/logs/watcher.heartbeat.json` (SPEC 0002 rev 4, section 13.3, A19): one beat
 * when the daemon context boots, then one every `WATCHER_HEARTBEAT_INTERVAL_MS` on its own unref'd
 * timer, independent of the run loop, so it keeps beating while a step executes. The watcher is
 * the file's only writer and writes it only through the C5 helper `writeWatcherHeartbeat`; the
 * value is `{ format: 1, at }` with the engine clock, never a pid. The timer stops when the context
 * closes at shutdown, and the file is never deleted, so a stopped watcher reads `dead`. A failed
 * write never stops the daemon: it is logged once per outage at warn, at most once per
 * `HEARTBEAT_WARNING_MIN_GAP_MS`, and the next tick tries again.
 */
@Injectable()
export class HeartbeatWriter implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatWriter.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private writing = false;
  private outage: HeartbeatOutage | null = null;
  private lastWarningAtMs = Number.NEGATIVE_INFINITY;

  constructor(
    @Inject(DataHome) private readonly dataHome: DataHome,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /** First beat at once, then the interval; a second call while running does nothing. */
  async start(): Promise<void> {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.beat(), WATCHER_HEARTBEAT_INTERVAL_MS);
    // The daemon loop keeps the process alive; the heartbeat must never be the reason it stays up.
    this.timer.unref();
    await this.beat();
  }

  /** Stops the timer only; the last beat stays on disk so readers see its age (A19). */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** One write; a tick that finds the previous write still running is skipped rather than queued. */
  private async beat(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      await writeWatcherHeartbeat(this.dataHome.logs, { format: 1, at: this.clock.now().toISOString() });
      this.onBeatWritten();
    } catch (error) {
      this.onBeatFailed(error);
    } finally {
      this.writing = false;
    }
  }

  private onBeatWritten(): void {
    if (this.outage === null) return;
    if (this.outage.reported) this.logger.log({ event: 'watcher.heartbeat-recovered', failedBeats: this.outage.failedBeats });
    this.outage = null;
  }

  private onBeatFailed(error: unknown): void {
    if (this.outage !== null) {
      this.outage.failedBeats += 1;
      return;
    }
    const nowMs = this.clock.now().getTime();
    const reported = nowMs - this.lastWarningAtMs >= HEARTBEAT_WARNING_MIN_GAP_MS;
    if (reported) {
      this.lastWarningAtMs = nowMs;
      this.logger.warn({ event: 'watcher.heartbeat-write-failed', error: errorName(error), code: errorCode(error) });
    }
    this.outage = { failedBeats: 1, reported };
  }
}
