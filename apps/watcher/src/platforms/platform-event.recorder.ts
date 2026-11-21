import { Injectable, Logger } from '@nestjs/common';
import { type RunId } from '@studio/shared/run-format';
import {
  type Platform,
  type PlatformMode,
  type PollBackoffReason,
  type PublishAttemptId,
  type PublishFailureReason,
  type PublishState,
  type ReconnectReason,
} from '@studio/shared/platforms';
import { type TokenBlockedReason } from './platform-token.session';
import { type AttemptRowMismatch } from './publication-attempt.reader';
import { type WithdrawnUpload } from './publish-recheck';

/** Why a poll pass ended without polling: a backoff reason or a blocked token; null otherwise. */
export type PollPassReason = PollBackoffReason | TokenBlockedReason | null;

/**
 * The watcher's platform events (SPEC 0007 section 7) and the operational lines around them. Every
 * field is an id, a platform, a state, a reason id, a count, a byte count, a duration or an error
 * class name (K7): never a token, a code, a `state` parameter, a verifier, a URL, a title, a
 * caption, a tag, an account label, a platform account id, a video id or a metric value.
 */
export type PlatformEvent =
  | { type: 'publish.cancelled'; attemptId: PublishAttemptId; runId: RunId; platform: Platform; mode: PlatformMode; claimed: boolean }
  | { type: 'publish.expired'; attemptId: PublishAttemptId; runId: RunId; platform: Platform; mode: PlatformMode; claimed: boolean }
  | { type: 'publish.started'; attemptId: PublishAttemptId; runId: RunId; platform: Platform; state: PublishState; bytesTotal: number }
  | {
      type: 'publish.finished';
      attemptId: PublishAttemptId;
      runId: RunId;
      platform: Platform;
      state: PublishState;
      reasonId: PublishFailureReason | null;
      bytesSent: number;
      durationMs: number;
    }
  /** The start-up sweep closed or adopted an attempt a previous process had claimed. */
  | { type: 'publish.swept'; attemptId: PublishAttemptId; from: PublishState; to: PublishState | 'status-checks-resumed' }
  /** Another live watcher process holds the claim; this one leaves the attempt alone. */
  | { type: 'publish.claim-held'; attemptId: PublishAttemptId; ownerPid: number | null }
  | { type: 'publish.attempt-unreadable'; attemptId: PublishAttemptId; error: string }
  | { type: 'publish.attempt-recovered'; attemptId: PublishAttemptId }
  /** `request.json` disagrees with its `publication_attempts` row (finding S3); names the field, never a value. */
  | { type: 'publish.request-mismatch'; attemptId: PublishAttemptId; field: AttemptRowMismatch }
  /** A withdrawn, claimed attempt of the same run and platform is uploading or published (finding R2); ids and the verdict only. */
  | { type: 'publish.withdrawn-upload-found'; attemptId: PublishAttemptId; withdrawnAttemptId: PublishAttemptId; verdict: WithdrawnUpload }
  | { type: 'publish.step-failed'; attemptId: PublishAttemptId | null; error: string }
  | { type: 'publish.progress-write-failed'; attemptId: PublishAttemptId; error: string }
  | { type: 'publish.status-check-failed'; attemptId: PublishAttemptId; platform: Platform; error: string; reasonId: string | null }
  | { type: 'platform.token-refreshed'; platform: Platform; connectionId: string }
  | { type: 'platform.needs-reconnect'; platform: Platform; connectionId: string; reason: ReconnectReason }
  | { type: 'platform.token-unavailable'; platform: Platform; connectionId: string; reasonId: TokenBlockedReason }
  /** `health.json` no longer parses (finding R7): that call is blocked and the file moved to `health.json.corrupt`; never its content. */
  | { type: 'platform.health-unreadable'; platform: Platform; error: string }
  /** The unreadable `health.json` could not be moved aside (R7): the platform stays blocked and the next read retries. */
  | { type: 'platform.health-set-aside-failed'; platform: Platform; error: string }
  /** The unreadable `health.json` was moved aside, but narrowing its mode to 0600 failed; the recovery itself stands. */
  | { type: 'platform.health-set-aside-mode-unchanged'; platform: Platform; error: string }
  | {
      type: 'metrics.poll-pass';
      platform: Platform;
      due: number;
      polled: number;
      stopped: number;
      calls: number;
      durationMs: number;
      backoffLevel: number | null;
      reasonId: PollPassReason;
    }
  | { type: 'metrics.poll-failed'; platform: Platform | null; error: string; reasonId: string | null }
  | { type: 'metrics.poll-recovered' };

type LogLevel = 'log' | 'warn' | 'error';

const levelOf: Readonly<Record<PlatformEvent['type'], LogLevel>> = {
  'publish.cancelled': 'log',
  'publish.expired': 'log',
  'publish.started': 'log',
  'publish.finished': 'log',
  'publish.swept': 'warn',
  'publish.claim-held': 'warn',
  'publish.attempt-unreadable': 'warn',
  'publish.attempt-recovered': 'log',
  'publish.request-mismatch': 'warn',
  'publish.withdrawn-upload-found': 'warn',
  'publish.step-failed': 'error',
  'publish.progress-write-failed': 'warn',
  'publish.status-check-failed': 'warn',
  'platform.token-refreshed': 'log',
  'platform.needs-reconnect': 'warn',
  'platform.token-unavailable': 'warn',
  'platform.health-unreadable': 'error',
  'platform.health-set-aside-failed': 'error',
  'platform.health-set-aside-mode-unchanged': 'warn',
  'metrics.poll-pass': 'log',
  'metrics.poll-failed': 'error',
  'metrics.poll-recovered': 'log',
};

/** Writes platform events to the daemon log (`logs/watcher.log`), the home of watcher events. */
@Injectable()
export class PlatformEventRecorder {
  private readonly logger = new Logger(PlatformEventRecorder.name);

  record(event: PlatformEvent): void {
    const { type, ...fields } = event;
    const line = { event: type, ...fields };
    switch (levelOf[type]) {
      case 'log':
        this.logger.log(line);
        return;
      case 'warn':
        this.logger.warn(line);
        return;
      case 'error':
        this.logger.error(line);
        return;
    }
  }
}
