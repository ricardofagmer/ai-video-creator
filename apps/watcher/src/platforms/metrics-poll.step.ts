import { Inject, Injectable } from '@nestjs/common';
import {
  HealthReader,
  PLATFORM_CLIENTS,
  PLATFORM_FILE_ROOT,
  PlatformClientError,
  PlatformFileCorruptError,
  PlatformStatusReader,
  localDateOf,
  type MetricResult,
  type PlatformClients,
  type PlatformSnapshot,
} from '@studio/core/platforms';
import { PLATFORM_FORMAT_VERSION, PlatformSchema, pollRules, type Platform, type PlatformMode } from '@studio/shared/platforms';
import { createMetricBatch, writePollCursor } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { clientReasonOf, isTokenRejection, pollBackoffOf } from './platform-call-failure';
import { PlatformEventRecorder, type PollPassReason } from './platform-event.recorder';
import { PlatformHealthWriter } from './platform-health.writer';
import { PlatformTokenSession } from './platform-token.session';
import { applyResults, nextBackoff, planPass, pruneEntries, type CursorEntries, type PassPlan } from './metrics-poll.plan';
import { PublicationTargetsReader, type PollTargetRow } from './publication-targets.reader';

/** A platform whose pass may run now: `metrics` connected, account in this process's mode, no backoff, an hour since the last pass. */
interface EligiblePlatform {
  platform: Platform;
  mode: PlatformMode;
  connectionId: string;
}

interface PassResult {
  entries: CursorEntries;
  called: boolean;
}

/**
 * Finding R5: the pass budget holds even for a client that ignores its signal. The call is raced
 * against the abort, which rejects with `abortError()`; an answer or a failure that arrives after
 * the abort is dropped (the handlers below still settle it, so nothing is left unhandled).
 */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal, abortError: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * The watcher's metrics poll (SPEC 0007 sections 5.5 and 5.7, OD3). The daemon loop calls `run`
 * between runs only, after the schedule step, under `busy.track`. At most once an hour per platform,
 * for each platform whose `metrics` status is `connected` and whose backoff has passed:
 *
 * 1. read `run_publications` (read-only; live mode skips `origin = 'mock'`, mock mode polls only
 *    it) and drop cursor entries whose publication is gone;
 * 2. `pollDue` per publication (daily to day 30, weekly to day 180, then `window-closed`);
 * 3. one client call for at most 50 due publications; the rest wait for the next pass;
 * 4. strikes for unknown or foreign publications, three stop them;
 * 5. one batch file (`asOfDate` = local today), then `cursor.json`, then `health.json`.
 *
 * No retry inside a pass: a 429, quota, 5xx or network error ends that platform's pass with no
 * second call, writes `health.json.backoff` and leaves the other platforms running (AC 56). A 401
 * triggers one token refresh and ends the pass; a refused refresh is `needs-reconnect` (AC 43). The
 * watcher writes the batch, the cursor and `health.json` only; the api ingests the batch (OD7, K1).
 * Never throws.
 */
@Injectable()
export class MetricsPollStep {
  private readonly lastPassMs = new Map<Platform, number>();
  /** Platforms whose throttled `health.json` check already logged a read error in the current outage. */
  private readonly throttledReadFailing = new Set<Platform>();
  private failing = false;

  constructor(
    @Inject(PlatformStatusReader) private readonly status: PlatformStatusReader,
    @Inject(PublicationTargetsReader) private readonly targets: PublicationTargetsReader,
    @Inject(HealthReader) private readonly healthReader: HealthReader,
    @Inject(PlatformTokenSession) private readonly tokens: PlatformTokenSession,
    @Inject(PlatformHealthWriter) private readonly health: PlatformHealthWriter,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** True when a platform call was made, so the loop scans `runs/` again at once. */
  async run(): Promise<boolean> {
    try {
      const called = await this.runPasses();
      if (this.failing) this.events.record({ type: 'metrics.poll-recovered' });
      this.failing = false;
      return called;
    } catch (error) {
      // The cursor or `run_publications` is unreadable: nothing is guessed; logged once per outage.
      if (!this.failing) this.events.record({ type: 'metrics.poll-failed', platform: null, error: errorName(error), reasonId: null });
      this.failing = true;
      return false;
    }
  }

  private async runPasses(): Promise<boolean> {
    const now = this.clock.now();
    const eligible: EligiblePlatform[] = [];
    for (const platform of PlatformSchema.options) {
      const candidate = await this.eligible(platform, now);
      if (candidate !== null) eligible.push(candidate);
    }
    if (eligible.length === 0) return false;
    const cursor = await this.healthReader.readCursor();
    const targets = await this.targets.list();
    let entries: CursorEntries = cursor === null ? {} : cursor.entries;
    if (!targets.truncated) entries = pruneEntries(entries, new Set(targets.rows.map((row) => row.publicationId)));
    let called = false;
    for (const candidate of eligible) {
      try {
        const result = await this.pass(candidate, targets.rows, entries, now);
        entries = result.entries;
        if (result.called) called = true;
      } catch (error) {
        this.events.record({ type: 'metrics.poll-failed', platform: candidate.platform, error: errorName(error), reasonId: clientReasonOf(error) });
      }
    }
    return called;
  }

  private async eligible(platform: Platform, now: Date): Promise<EligiblePlatform | null> {
    const nowMs = now.getTime();
    const lastMs = this.lastPassMs.get(platform);
    if (lastMs !== undefined && nowMs - lastMs < pollRules.minPassIntervalMs) {
      // Round 4 item B: inside the hourly spacing the snapshot below is not read, so an unreadable
      // `health.json` is still moved aside in this tick (R7) rather than at the next pass. Any other
      // read error stays with this platform, as in the snapshot branch below, so it cannot stop the
      // other platforms' passes (critic round 4, minor 1). This branch runs on every loop tick, so the
      // error is logged once per outage, like `run()` does, not once a second (critic round 5).
      try {
        await this.health.recoverIfUnreadable(platform);
        this.throttledReadFailing.delete(platform);
      } catch (error) {
        if (!this.throttledReadFailing.has(platform)) {
          this.events.record({ type: 'metrics.poll-failed', platform, error: errorName(error), reasonId: null });
        }
        this.throttledReadFailing.add(platform);
      }
      return null;
    }
    let snapshot: PlatformSnapshot;
    try {
      snapshot = await this.status.snapshot(platform);
    } catch (error) {
      this.lastPassMs.set(platform, nowMs);
      // Finding R7: an unreadable `health.json` blocks this pass and is moved aside, so a later pass
      // reads no health file; the writer logs it as `platform.health-unreadable`.
      if (error instanceof PlatformFileCorruptError && error.file === 'health.json') await this.health.recoverUnreadable(platform, error);
      else this.events.record({ type: 'metrics.poll-failed', platform, error: errorName(error), reasonId: null });
      return null;
    }
    const { account, health } = snapshot;
    if (snapshot.status.metrics !== 'connected' || account === null || account.mode !== snapshot.mode) return null;
    if (health !== null && health.backoff !== null && Date.parse(health.backoff.until) > nowMs) return null;
    // Across restarts: the last poll this connection recorded also spaces the passes.
    if (health !== null && health.lastPollAt !== null && nowMs - Date.parse(health.lastPollAt) < pollRules.minPassIntervalMs) return null;
    return { platform, mode: snapshot.mode, connectionId: account.connectionId };
  }

  private async pass(candidate: EligiblePlatform, rows: readonly PollTargetRow[], entries: CursorEntries, now: Date): Promise<PassResult> {
    const { platform, mode, connectionId } = candidate;
    const startedAtMs = now.getTime();
    this.lastPassMs.set(platform, startedAtMs);
    const today = localDateOf(now);
    const plan = planPass({ platform, mode, rows, entries, today });
    if (plan.targets.length === 0) {
      await this.saveStops(plan, now);
      this.recordPass({ candidate, plan, polled: 0, stopped: plan.stopped, calls: 0, startedAtMs, backoffLevel: null, reasonId: null });
      return { entries: plan.entries, called: false };
    }

    let results: MetricResult[];
    let calls = 0;
    // Section 5.5 step 3, findings C7 and R5: the pass budget aborts the client at its next request
    // boundary, and the step stops waiting for it at that moment whatever the client does; the abort
    // surfaces as a `network` failure and ends the pass through the backoff path below.
    const budget = new AbortController();
    const budgetTimer = setTimeout(() => budget.abort(), pollRules.passBudgetMs);
    try {
      const acquisition = await this.tokens.acquire(platform, connectionId);
      if (acquisition.status === 'blocked') {
        await this.saveStops(plan, now);
        this.recordPass({ candidate, plan, polled: 0, stopped: plan.stopped, calls, startedAtMs, backoffLevel: null, reasonId: acquisition.reasonId });
        return { entries: plan.entries, called: false };
      }
      calls = 1;
      const call = this.clients.clientFor(platform).fetchMetrics({ targets: plan.targets, tokens: acquisition.bundle, now, signal: budget.signal });
      results = await raceAbort(call, budget.signal, () => new PlatformClientError(platform, 'metrics', 'network'));
    } catch (error) {
      await this.saveStops(plan, now);
      await this.afterFailedCall({ candidate, plan, error, calls, startedAtMs, now });
      return { entries: plan.entries, called: calls > 0 };
    } finally {
      clearTimeout(budgetTimer);
    }

    const applied = applyResults({ targets: plan.targets, results, entries: plan.entries, today });
    if (applied.rows.length > 0) {
      await createMetricBatch(this.platformRoot, {
        format: PLATFORM_FORMAT_VERSION,
        batchId: newUlid(startedAtMs),
        platform,
        mode,
        asOfDate: today,
        pulledAt: now.toISOString(),
        rows: applied.rows,
      });
    }
    await this.writeCursor(applied.entries, now);
    await this.health.recordPassSucceeded(platform, connectionId, now);
    const stopped = plan.stopped + applied.stopped;
    this.recordPass({ candidate, plan, polled: applied.polled, stopped, calls, startedAtMs, backoffLevel: null, reasonId: null });
    return { entries: applied.entries, called: true };
  }

  /** Section 5.7 backoff, or the single refresh a 401 triggers; never a second metrics call. */
  private async afterFailedCall(failure: { candidate: EligiblePlatform; plan: PassPlan; error: unknown; calls: number; startedAtMs: number; now: Date }): Promise<void> {
    const { candidate, plan, error, calls, startedAtMs, now } = failure;
    const { platform, connectionId } = candidate;
    const backoff = pollBackoffOf(error);
    if (backoff !== null) {
      const previous = await this.health.backoffOf(platform, connectionId);
      const next = nextBackoff({ platform, previous, reasonId: backoff.reasonId, retryAfterSeconds: backoff.retryAfterSeconds, now });
      await this.health.recordBackoff(platform, connectionId, next);
      this.recordPass({ candidate, plan, polled: 0, stopped: plan.stopped, calls, startedAtMs, backoffLevel: next.level, reasonId: backoff.reasonId });
      return;
    }
    this.events.record({ type: 'metrics.poll-failed', platform, error: errorName(error), reasonId: clientReasonOf(error) });
    if (isTokenRejection(error)) await this.tokens.refreshAfterRejection(platform, connectionId);
  }

  /** `window-closed` stops found by the plan are kept even when no call was made. */
  private async saveStops(plan: PassPlan, now: Date): Promise<void> {
    if (plan.stopped > 0) await this.writeCursor(plan.entries, now);
  }

  private async writeCursor(entries: CursorEntries, now: Date): Promise<void> {
    await writePollCursor(this.platformRoot, { format: PLATFORM_FORMAT_VERSION, updatedAt: now.toISOString(), entries });
  }

  private recordPass(pass: {
    candidate: EligiblePlatform;
    plan: PassPlan;
    polled: number;
    stopped: number;
    calls: number;
    startedAtMs: number;
    backoffLevel: number | null;
    reasonId: PollPassReason;
  }): void {
    this.events.record({
      type: 'metrics.poll-pass',
      platform: pass.candidate.platform,
      due: pass.plan.due,
      polled: pass.polled,
      stopped: pass.stopped,
      calls: pass.calls,
      durationMs: Math.max(0, this.clock.now().getTime() - pass.startedAtMs),
      backoffLevel: pass.backoffLevel,
      reasonId: pass.reasonId,
    });
  }
}
