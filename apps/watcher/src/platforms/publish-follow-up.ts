import { Inject, Injectable } from '@nestjs/common';
import { PLATFORM_CLIENTS, type PlatformClients, type TokenBundle, type UploadStatus } from '@studio/core/platforms';
import { publishBounds, type PublishAttemptId, type PublishRequestFile, type PublishStateFile } from '@studio/shared/platforms';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { clientReasonOf, isTokenRejection, publishReasonOfBlockedToken } from './platform-call-failure';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PlatformTokenSession, type TokenAcquisition } from './platform-token.session';
import { PublishAttemptFiles, type PublishStateChange } from './publish-attempt.files';
import { PublishCloser, publishedChange } from './publish-closer';

/** Section 5.5: while `sent-to-inbox`, one status call per idle hour until `followUntil`. */
export const INBOX_CHECK_EVERY_MS = 3_600_000;

/**
 * Finding R1: token acquisitions in one phase that sent no query (a failure, `token.lock` held, an
 * unreadable `health.json`) before the attempt gives up unconfirmed. At the processing interval that
 * is about an hour of awake ticks, so neither a Keychain or refresh outage nor a lock that never
 * frees can keep an attempt followed for ever.
 */
export const MAX_TOKEN_WAITS = 2 * publishBounds.processingChecks;

type FollowedPhase = 'processing' | 'sent-to-inbox';

/**
 * Why a check got no token: `failed`, the acquisition itself failed (refresh or Keychain); `transient`,
 * `token.lock` was held or `health.json` was unreadable (R7), both of which clear on their own.
 */
type TokenWait = 'failed' | 'transient';

/** The token for one check, a wait, or the attempt was closed. */
type CheckToken = { status: 'ready'; bundle: TokenBundle } | { status: 'waiting'; wait: TokenWait } | { status: 'closed' };

interface FollowedAttempt {
  attemptId: PublishAttemptId;
  phase: FollowedPhase;
  /** The platform's reference; null when it was not a plain id and a restart lost it. */
  uploadRef: string | null;
  /**
   * `sent-to-inbox`: `followUntil`. `processing`: none, it ends by check count only (finding C2), so a
   * sleep or a restart longer than 30 minutes never turns it into `outcome-unknown` unchecked.
   */
  deadlineMs: number;
  /** Status queries made in the current phase by this process. */
  checks: number;
  /** Token acquisitions in the current phase that sent no query (finding R1). */
  tokenWaits: number;
  /** A ready give-up ran ahead of the interval once; when its file reads failed, later tries wait the interval. */
  giveUpTried: boolean;
  lastCheckMs: number;
  /** When this process claimed the attempt; null for an attempt adopted by the start-up sweep. */
  startedAtMs: number | null;
}

/**
 * Status checks after the last byte (SPEC 0007 section 5.5 "finish" and "TikTok follow-up"). They
 * send no video bytes, so an attempt adopted by the start-up sweep resumes them safely. One check
 * per idle tick at most, never inside a run:
 *
 * - `processing`: one check a minute, at most 30 queries counted by this process, whatever the wall
 *   clock did meanwhile; then `published`, `failed`, or (still processing after 30, no reference, or
 *   out of token waits) `outcome-unknown`, each with its closing line;
 * - `sent-to-inbox`: one check an hour until `followUntil`, and at least one query before the window
 *   closes; `published` (with its own `published` line) when the platform reports the public post,
 *   otherwise `inbox-unconfirmed` (the closing line was `sent-to-inbox`).
 *
 * A revoked token fails a `processing` attempt with `token-revoked`; a 429, 5xx or network error
 * just waits for the next check. A token that cannot be had waits for the next check too, without
 * counting as a query. Past `followUntil` only a real acquisition failure (refresh or Keychain) stands
 * for the window's one query; a held lock or an unreadable `health.json` does not. Every such wait
 * counts toward `MAX_TOKEN_WAITS`, after which the attempt gives up unconfirmed (finding R1). Every
 * retry waits the phase's interval: only a ready give-up runs at once, and only the first time.
 */
@Injectable()
export class PublishFollowUp {
  private readonly followed = new Map<PublishAttemptId, FollowedAttempt>();

  constructor(
    @Inject(PublishAttemptFiles) private readonly files: PublishAttemptFiles,
    @Inject(PublishCloser) private readonly closer: PublishCloser,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(PlatformTokenSession) private readonly tokens: PlatformTokenSession,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** After this process's upload ended in `processing` or `sent-to-inbox`. */
  track(state: PublishStateFile, uploadRef: string, startedAtMs: number): void {
    this.follow(state, uploadRef, { lastCheckMs: this.clock.now().getTime(), startedAtMs });
  }

  /** The start-up sweep found an attempt whose claimant is gone in `processing` or `sent-to-inbox`. */
  adopt(state: PublishStateFile): void {
    this.follow(state, state.platformMediaId, { lastCheckMs: Number.NEGATIVE_INFINITY, startedAtMs: null });
  }

  /** Runs the oldest due check; true when one ran. */
  async checkDue(): Promise<boolean> {
    const nowMs = this.clock.now().getTime();
    for (const followed of this.followed.values()) {
      const every = followed.phase === 'processing' ? publishBounds.processingCheckEveryMs : INBOX_CHECK_EVERY_MS;
      const giveUpReady = this.readyToGiveUp(followed, nowMs);
      if (nowMs - followed.lastCheckMs < every && (!giveUpReady || followed.giveUpTried)) continue;
      // Marked before any read, so an attempt whose files fail to read never starves the others.
      followed.lastCheckMs = nowMs;
      followed.giveUpTried ||= giveUpReady;
      await this.checkOne(followed, nowMs);
      return true;
    }
    return false;
  }

  private follow(state: PublishStateFile, uploadRef: string | null, timing: { lastCheckMs: number; startedAtMs: number | null }): void {
    if (state.state !== 'processing' && state.state !== 'sent-to-inbox') return;
    const deadlineMs = state.state === 'processing' ? Number.POSITIVE_INFINITY : Date.parse(state.followUntil ?? state.since);
    this.followed.set(state.attemptId, { attemptId: state.attemptId, phase: state.state, uploadRef, deadlineMs, checks: 0, tokenWaits: 0, giveUpTried: false, ...timing });
  }

  /**
   * The attempt ends unconfirmed without a query: no reference; `processing` after its last allowed
   * query (C2); `sent-to-inbox` past `followUntil` once it had its one query (C2); or out of token
   * waits (R1).
   */
  private readyToGiveUp(followed: FollowedAttempt, nowMs: number): boolean {
    if (followed.uploadRef === null || followed.tokenWaits >= MAX_TOKEN_WAITS) return true;
    if (followed.phase === 'processing') return followed.checks >= publishBounds.processingChecks;
    return followed.checks > 0 && nowMs >= followed.deadlineMs;
  }

  private async checkOne(followed: FollowedAttempt, nowMs: number): Promise<void> {
    const state = await this.files.readState(followed.attemptId);
    const request = await this.files.readRequest(followed.attemptId);
    if (state === null || request === null || state.state !== followed.phase) {
      this.followed.delete(followed.attemptId);
      return;
    }
    const { uploadRef } = followed;
    if (uploadRef === null || this.readyToGiveUp(followed, nowMs)) {
      await this.giveUp(followed, request, state);
      return;
    }
    const token = await this.tokenFor(followed, request, state);
    if (token.status === 'closed') return;
    if (token.status === 'waiting') {
      this.countTokenWait(followed, token.wait, nowMs);
      return;
    }
    // Counted once a query is really sent: before the deadline a token wait is not a check (C2).
    followed.checks += 1;
    let status: UploadStatus;
    try {
      status = await this.clients
        .clientFor(request.platform)
        .uploadStatus({ attemptId: followed.attemptId, uploadRef, tokens: token.bundle, now: this.clock.now() });
    } catch (error) {
      await this.afterFailedCheck(followed, request, state, error);
      return;
    }
    await this.apply(followed, request, state, status);
  }

  /** The token for one check; `waiting` when the lock is held, the health is unknown or the acquisition failed; `closed` when the attempt was closed. */
  private async tokenFor(followed: FollowedAttempt, request: PublishRequestFile, state: PublishStateFile): Promise<CheckToken> {
    let acquisition: TokenAcquisition;
    try {
      acquisition = await this.tokens.acquire(request.platform, request.connectionId);
    } catch (error) {
      this.recordFailedCheck(followed, request, error);
      return { status: 'waiting', wait: 'failed' };
    }
    if (acquisition.status === 'ready') return { status: 'ready', bundle: acquisition.bundle };
    // Neither proves the attempt failed: the lock frees, and an unreadable `health.json` was moved
    // aside, so the next call reads no file (R7).
    if (acquisition.reasonId === 'lock-held' || acquisition.reasonId === 'health-unknown') return { status: 'waiting', wait: 'transient' };
    await this.closeOpen(followed, request, state, { state: 'failed', reasonId: publishReasonOfBlockedToken(acquisition.reasonId) });
    return { status: 'closed' };
  }

  /**
   * Finding R1: every wait counts toward `MAX_TOKEN_WAITS`, so every attempt still ends. Past
   * `followUntil` a failed acquisition also stands for the window's one query, so the next tick gives
   * up instead of retrying a broken token; a transient wait does not, so the query is still tried.
   */
  private countTokenWait(followed: FollowedAttempt, wait: TokenWait, nowMs: number): void {
    followed.tokenWaits += 1;
    if (wait === 'failed' && nowMs >= followed.deadlineMs) followed.checks += 1;
  }

  private async afterFailedCheck(followed: FollowedAttempt, request: PublishRequestFile, state: PublishStateFile, error: unknown): Promise<void> {
    this.recordFailedCheck(followed, request, error);
    if (!isTokenRejection(error)) return;
    const refreshed = await this.tokens.refreshAfterRejection(request.platform, request.connectionId);
    if (refreshed.status === 'blocked' && refreshed.reasonId === 'needs-reconnect') {
      await this.closeOpen(followed, request, state, { state: 'failed', reasonId: 'token-revoked' });
    }
  }

  private async apply(followed: FollowedAttempt, request: PublishRequestFile, state: PublishStateFile, status: UploadStatus): Promise<void> {
    switch (status.state) {
      case 'processing':
        return;
      case 'sent-to-inbox': {
        if (followed.phase === 'sent-to-inbox') return;
        const followUntil = new Date(this.clock.now().getTime() + publishBounds.inboxFollowMs).toISOString();
        const change: PublishStateChange = { state: 'sent-to-inbox', followUntil };
        await this.closer.close({ request, previous: state, change, appendLine: true, startedAtMs: followed.startedAtMs });
        followed.phase = 'sent-to-inbox';
        followed.deadlineMs = Date.parse(followUntil);
        followed.checks = 0;
        followed.tokenWaits = 0;
        followed.giveUpTried = false;
        return;
      }
      case 'published': {
        const change = publishedChange(request.platform, status, state.bytesTotal);
        await this.closeOpen(followed, request, state, change ?? this.unconfirmed(followed));
        return;
      }
      case 'failed':
        // After the inbox, a failed status still means the draft may be there: the owner confirms.
        await this.closeOpen(followed, request, state, followed.phase === 'processing' ? { state: 'failed', reasonId: status.reasonId } : this.unconfirmed(followed));
        return;
    }
  }

  private async giveUp(followed: FollowedAttempt, request: PublishRequestFile, state: PublishStateFile): Promise<void> {
    await this.closeOpen(followed, request, state, this.unconfirmed(followed));
  }

  /** Not confirmed: `outcome-unknown` after processing, `inbox-unconfirmed` after the inbox (the owner pastes the link). */
  private unconfirmed(followed: FollowedAttempt): PublishStateChange {
    return followed.phase === 'processing' ? { state: 'outcome-unknown' } : { state: 'inbox-unconfirmed' };
  }

  /**
   * A terminal move. A `processing` attempt appends its closing line. An inbox attempt already has
   * `sent-to-inbox`; only a draft later found published appends `published` too, so the run's
   * record names the public video (finding C11).
   */
  private async closeOpen(followed: FollowedAttempt, request: PublishRequestFile, state: PublishStateFile, change: PublishStateChange): Promise<void> {
    this.followed.delete(followed.attemptId);
    const appendLine = followed.phase === 'processing' || change.state === 'published';
    await this.closer.close({ request, previous: state, change, appendLine, startedAtMs: followed.startedAtMs });
  }

  private recordFailedCheck(followed: FollowedAttempt, request: PublishRequestFile, error: unknown): void {
    this.events.record({
      type: 'publish.status-check-failed',
      attemptId: followed.attemptId,
      platform: request.platform,
      error: errorName(error),
      reasonId: clientReasonOf(error),
    });
  }
}
