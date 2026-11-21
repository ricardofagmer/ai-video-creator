import { Inject, Injectable } from '@nestjs/common';
import { type PublicationPollingView } from '@studio/shared/api';
import { type IsoDate } from '@studio/shared/metrics';
import {
  pollDue,
  type CapabilityStatus,
  type Platform,
  type PlatformMode,
  type PollCursorEntry,
  type PollCursorFile,
} from '@studio/shared/platforms';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_CLOCK, localDateOf, type PlatformClock } from './platform-runtime';
import { HealthReader } from './stores/platform-file.stores';

/** The facts the polling line of one publication derives from (SPEC 0007 sections 5.5 and 5.9). */
export interface PublicationPollingFacts {
  mode: PlatformMode;
  metricsStatus: CapabilityStatus;
  origin: string;
  /** `publishedOn`, or the local day of `recordedAt` when the owner gave none (section 5.5 step 2). */
  pollFrom: IsoDate;
  entry: PollCursorEntry | null;
  today: IsoDate;
}

/**
 * The polling line of a publication. `not-polled`: the platform's `metrics` status is not
 * `connected`, or the publication is simulated while the platform is live (B6). `stopped`: the
 * cursor stopped it, or the 180-day window closed. Otherwise `active`, next on the OD3 cadence.
 */
export function publicationPolling(facts: PublicationPollingFacts): PublicationPollingView {
  const lastPolledOn = facts.entry === null ? null : facts.entry.lastPolledOn;
  if (facts.metricsStatus !== 'connected' || (facts.mode === 'live' && facts.origin === 'mock')) {
    return { state: 'not-polled', lastPolledOn, nextPollOn: null, stopReason: null };
  }
  if (facts.entry !== null && facts.entry.stopped !== null) {
    return { state: 'stopped', lastPolledOn, nextPollOn: null, stopReason: facts.entry.stopped };
  }
  const decision = pollDue(facts.pollFrom, lastPolledOn, facts.today);
  if (decision.status === 'stopped') return { state: 'stopped', lastPolledOn, nextPollOn: null, stopReason: decision.reason };
  const nextPollOn = decision.status === 'due' ? facts.today : decision.nextPollOn;
  return { state: 'active', lastPolledOn, nextPollOn, stopReason: null };
}

/** The cursor entry of a publication, or null when it was never polled. */
export function cursorEntryOf(cursor: PollCursorFile | null, publicationId: string): PollCursorEntry | null {
  if (cursor === null) return null;
  return Object.hasOwn(cursor.entries, publicationId) ? (cursor.entries[publicationId] ?? null) : null;
}

/**
 * `PlatformView.trackedPublications`: the publications of a platform whose polling line is
 * `active`. Read-only (Prisma reads and `cursor.json`), so the watcher's read module may provide it.
 */
@Injectable()
export class PublicationTrackingReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthReader: HealthReader,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
  ) {}

  async countTracked(options: { platform: Platform; mode: PlatformMode; metricsStatus: CapabilityStatus }): Promise<number> {
    if (options.metricsStatus !== 'connected') return 0;
    const rows = await this.prisma.runPublication.findMany({
      where: options.mode === 'live' ? { platform: options.platform, origin: { not: 'mock' } } : { platform: options.platform },
      select: { id: true, origin: true, publishedOn: true, recordedAt: true },
    });
    const cursor = await this.healthReader.readCursor();
    const today = localDateOf(this.clock.now());
    return rows.filter((row) => {
      const polling = publicationPolling({
        mode: options.mode,
        metricsStatus: options.metricsStatus,
        origin: row.origin,
        pollFrom: row.publishedOn ?? localDateOf(row.recordedAt),
        entry: cursorEntryOf(cursor, row.id),
        today,
      });
      return polling.state === 'active';
    }).length;
  }
}
