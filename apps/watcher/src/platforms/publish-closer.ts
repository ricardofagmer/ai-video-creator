import { Inject, Injectable } from '@nestjs/common';
import { parsePublicationUrl, platformVideoIdPatterns } from '@studio/shared/metrics';
import { type Platform, type PublishRequestFile, type PublishStateFile } from '@studio/shared/platforms';
import { IsoDateTimeSchema } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PublishAttemptFiles, type PublishStateChange } from './publish-attempt.files';

/** The ids and instant a platform reported for a published video, before they are trusted. */
export interface ReportedPublication {
  platformVideoId: string;
  platformMediaId: string | null;
  publishedAt: string;
  /** The post link the platform reported (TikTok `share_url`), untrusted until checked here. */
  publicationUrl?: string | null;
}

/**
 * The platform's own reference for an upload, kept in `state.json` only when it is a plain id.
 * `~` is allowed because TikTok's `publish_id` carries one (`v_inbox_file~v2...`); without it the
 * ref lived in memory only and a watcher restart lost the inbox follow-up (wave 4 decision).
 */
const storableRefPattern = /^[A-Za-z0-9_.~-]{1,64}$/;

/** The reported link in its canonical form, or null when it is not this platform's link to this video. */
function trustedPublicationUrl(platform: Platform, platformVideoId: string, reported: string | null | undefined): string | null {
  if (reported === null || reported === undefined) return null;
  const parsed = parsePublicationUrl(reported);
  if (parsed.status !== 'recognized' || parsed.platform !== platform || parsed.platformVideoId !== platformVideoId) return null;
  return parsed.url;
}

/** An upload reference safe to persist (`platformMediaId`, at most 64 characters); null keeps it in memory only. */
export function storableUploadRef(uploadRef: string): string | null {
  return storableRefPattern.test(uploadRef) ? uploadRef : null;
}

/**
 * The published change, or null when the platform's answer does not match the contract: the video
 * id must match `platformVideoIdPatterns` (at most 40 characters), the media id must be a plain id
 * and the instant an ISO date-time (K10). An untrusted answer after the bytes left is
 * `outcome-unknown`, never `published`.
 */
export function publishedChange(platform: Platform, reported: ReportedPublication, bytesTotal: number): PublishStateChange | null {
  const { platformVideoId, platformMediaId, publishedAt } = reported;
  if (platformVideoId.length > 40 || !platformVideoIdPatterns[platform].test(platformVideoId)) return null;
  if (platformMediaId !== null && !storableRefPattern.test(platformMediaId)) return null;
  if (!IsoDateTimeSchema.safeParse(publishedAt).success) return null;
  // An unusable link only leaves the link out; the published answer itself is still trusted.
  const publicationUrl = trustedPublicationUrl(platform, platformVideoId, reported.publicationUrl);
  const change: PublishStateChange = { state: 'published', bytesSent: bytesTotal, platformVideoId, platformMediaId, publishedAt };
  return publicationUrl === null ? change : { ...change, publicationUrl };
}

export interface CloseOptions {
  request: PublishRequestFile;
  previous: PublishStateFile | null;
  change: PublishStateChange;
  /** Whether this move appends the closing line of `publications.jsonl` (section 5.5 "close"). */
  appendLine: boolean;
  /** When the watcher claimed the attempt, for `durationMs`; null when an earlier process claimed it. */
  startedAtMs: number | null;
}

/**
 * Writes a decided state of an attempt, then its closing `publications.jsonl` line, then the
 * `publish.finished` event. The state is written first: a crash in between leaves a decided state
 * with a missing line, never an `uploading` attempt with a closing line that the start-up sweep
 * would contradict.
 */
@Injectable()
export class PublishCloser {
  constructor(
    @Inject(PublishAttemptFiles) private readonly files: PublishAttemptFiles,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async close(options: CloseOptions): Promise<PublishStateFile> {
    const { request, change } = options;
    const now = this.clock.now();
    const next = await this.files.moveState(request.attemptId, options.previous, change, now);
    if (options.appendLine && next.state !== 'queued') await this.appendClosingLine(request, next, now);
    this.events.record({
      type: 'publish.finished',
      attemptId: request.attemptId,
      runId: request.runId,
      platform: request.platform,
      state: next.state,
      reasonId: next.reasonId,
      bytesSent: next.bytesSent,
      durationMs: options.startedAtMs === null ? 0 : Math.max(0, now.getTime() - options.startedAtMs),
    });
    return next;
  }

  private async appendClosingLine(request: PublishRequestFile, state: PublishStateFile, now: Date): Promise<void> {
    switch (state.state) {
      case 'published':
      case 'sent-to-inbox':
      case 'failed':
      case 'outcome-unknown':
        await this.files.appendLine(
          request,
          { event: state.state, platformVideoId: state.state === 'published' ? state.platformVideoId : null, reasonId: state.reasonId },
          now,
        );
        return;
      default:
        // `processing`, `cancelled`, `expired` and `inbox-unconfirmed` have no line: nothing new left the machine.
        return;
    }
  }
}
