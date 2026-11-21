import { Injectable } from '@nestjs/common';
import { type PlatformView } from '@studio/shared/api';
import { type Platform } from '@studio/shared/platforms';
import { PlatformStatusReader, toPlatformView } from './platform-status.reader';
import { PublicationTrackingReader } from './publication-tracking';

/** One `/contas` card read fresh: the status snapshot plus the publications polling tracks. Read-only. */
@Injectable()
export class PlatformViewReader {
  constructor(
    private readonly statusReader: PlatformStatusReader,
    private readonly tracking: PublicationTrackingReader,
  ) {}

  async viewOf(platform: Platform): Promise<PlatformView> {
    const snapshot = await this.statusReader.snapshot(platform);
    const trackedPublications = await this.tracking.countTracked({
      platform,
      mode: snapshot.mode,
      metricsStatus: snapshot.status.metrics,
    });
    return toPlatformView(snapshot, trackedPublications);
  }
}
