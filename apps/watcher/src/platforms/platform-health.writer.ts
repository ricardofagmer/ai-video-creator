import { Inject, Injectable } from '@nestjs/common';
import { HealthReader, PLATFORM_FILE_ROOT, PlatformFileCorruptError } from '@studio/core/platforms';
import { PLATFORM_FORMAT_VERSION, type HealthFile, type Platform, type PollBackoff, type ReconnectReason } from '@studio/shared/platforms';
import { writeHealthFile } from '@studio/shared/platforms/files';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { setAsideCorruptHealthFile, type SetAsideResult } from './health-file.set-aside';
import { PlatformEventRecorder } from './platform-event.recorder';

/**
 * What `health.json` says about one connection's token (finding R7): `blocked` (`needs-reconnect`),
 * `clear` (no file, a file of another connection, or `ok`), or `unknown` (the file no longer parses;
 * it was moved aside, so the next read finds no file).
 */
export type ConnectionHealth = 'blocked' | 'clear' | 'unknown';

/**
 * The watcher's writes of `accounts/<platform>/health.json` (SPEC 0007 sections 4.6, 5.2 and 5.7):
 * token health, poll backoff and the last poll, written only between runs through the shared
 * `writeHealthFile`. A health file applies to one `connectionId`; a file left by an older connection
 * is replaced by a fresh one for the current connection. A file that no longer parses is moved aside
 * to `health.json.corrupt` (finding R7). Never holds a token, an expiry value or an account label.
 */
@Injectable()
export class PlatformHealthWriter {
  /** Platforms whose unreadable `health.json` could not be moved aside yet; logged once per outage. */
  private readonly unreadableReported = new Set<Platform>();

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(HealthReader) private readonly healthReader: HealthReader,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Section 5.2: a failed refresh. No call is made for the platform until `connectionId` changes. */
  async markNeedsReconnect(platform: Platform, connectionId: string, reason: ReconnectReason): Promise<void> {
    const current = await this.current(platform, connectionId);
    await this.write({ ...current, token: 'needs-reconnect', reconnectReason: reason, checkedAt: this.clock.now().toISOString() });
  }

  /** Section 5.7: a successful pass clears the backoff and records the poll instant. */
  async recordPassSucceeded(platform: Platform, connectionId: string, polledAt: Date): Promise<void> {
    const current = await this.current(platform, connectionId);
    const at = polledAt.toISOString();
    await this.write({ ...current, token: 'ok', reconnectReason: null, checkedAt: at, backoff: null, lastPollAt: at });
  }

  /** Section 5.7: a 429, quota, 5xx or network error ended the pass; the next one waits until `until`. */
  async recordBackoff(platform: Platform, connectionId: string, backoff: PollBackoff): Promise<void> {
    const current = await this.current(platform, connectionId);
    await this.write({ ...current, checkedAt: this.clock.now().toISOString(), backoff });
  }

  /**
   * What `health.json` says for this connection (findings C10, R7). A file of an older connection
   * does not block. A file that no longer parses is `unknown`, never `clear`: it may have held
   * `needs-reconnect`, so the caller blocks the platform for this call, and the file is moved aside
   * (`recoverUnreadable`). From the next call the platform reads as having no health file; a block
   * that still applies comes back from that call's token use (a refused refresh writes
   * `needs-reconnect` again).
   */
  async connectionHealth(platform: Platform, connectionId: string): Promise<ConnectionHealth> {
    let health: HealthFile | null;
    try {
      health = await this.healthReader.forConnection(platform, connectionId);
    } catch (error) {
      if (!(error instanceof PlatformFileCorruptError)) throw error;
      await this.recoverUnreadable(platform, error);
      return 'unknown';
    }
    this.unreadableReported.delete(platform);
    return health !== null && health.token === 'needs-reconnect' ? 'blocked' : 'clear';
  }

  /**
   * Finding R7 recovery, for any watcher read that found `health.json` unparseable: logs
   * `platform.health-unreadable` by platform and error class only (never the file's content), then
   * moves the file to `health.json.corrupt`. A move that fails leaves the platform blocked; the next
   * read tries again, and the outage is logged once. A move that landed but whose chmod failed is
   * recovered all the same: it logs `platform.health-set-aside-mode-unchanged`, never
   * `platform.health-set-aside-failed` (round 4 nit).
   */
  async recoverUnreadable(platform: Platform, error: PlatformFileCorruptError): Promise<void> {
    const firstReport = !this.unreadableReported.has(platform);
    if (firstReport) this.events.record({ type: 'platform.health-unreadable', platform, error: errorName(error) });
    let moved: SetAsideResult;
    try {
      moved = await setAsideCorruptHealthFile(this.platformRoot, platform);
    } catch (moveError) {
      if (firstReport) this.events.record({ type: 'platform.health-set-aside-failed', platform, error: errorName(moveError) });
      this.unreadableReported.add(platform);
      return;
    }
    this.unreadableReported.delete(platform);
    if (moved.status === 'moved-mode-unchanged') {
      this.events.record({ type: 'platform.health-set-aside-mode-unchanged', platform, error: errorName(moved.error) });
    }
  }

  /**
   * Round 4 item B: the R7 recovery for a caller that holds no connection, such as a metrics pass
   * still inside its hourly spacing. Reads `health.json` whatever connection it names and moves it
   * aside when it no longer parses; a readable or absent file changes nothing.
   */
  async recoverIfUnreadable(platform: Platform): Promise<void> {
    try {
      await this.healthReader.read(platform);
    } catch (error) {
      if (!(error instanceof PlatformFileCorruptError)) throw error;
      await this.recoverUnreadable(platform, error);
      return;
    }
    this.unreadableReported.delete(platform);
  }

  /** The backoff in force for this connection, or null; read before computing the next level. */
  async backoffOf(platform: Platform, connectionId: string): Promise<PollBackoff | null> {
    return (await this.current(platform, connectionId)).backoff;
  }

  private async write(file: HealthFile): Promise<void> {
    await writeHealthFile(this.platformRoot, file);
  }

  private async current(platform: Platform, connectionId: string): Promise<HealthFile> {
    const fresh: HealthFile = {
      format: PLATFORM_FORMAT_VERSION,
      platform,
      connectionId,
      token: 'ok',
      reconnectReason: null,
      checkedAt: this.clock.now().toISOString(),
      backoff: null,
      lastPollAt: null,
    };
    try {
      return (await this.healthReader.forConnection(platform, connectionId)) ?? fresh;
    } catch (error) {
      // A token call moves an unreadable file aside before any write (R7), so this meets only a file
      // damaged since; the watcher is its only writer, so it is replaced, never guessed from.
      if (error instanceof PlatformFileCorruptError) return fresh;
      throw error;
    }
  }
}
