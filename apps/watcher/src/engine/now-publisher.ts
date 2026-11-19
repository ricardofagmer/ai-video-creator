import { writeNowFile } from '@studio/shared/run-files';
import { NOW_ACTIVITY_LIMIT, type Activity, type RunCursor, type RunId } from '@studio/shared/run-format';
import { type Clock } from './clock';
import { clip, textLimits } from './text';

export interface NowPublisherOptions {
  runDir: string;
  runId: RunId;
  pid: number;
  clock: Clock;
  /** Where the run is; now.json is written only while a cursor exists. */
  cursor: () => RunCursor | null;
}

/** now.json `parallel` and `notice` caps (C3). */
const PARALLEL_TEXT_MAX = 200;
const NOTICE_TEXT_MAX = 500;

/**
 * The live snapshot (RUN-FORMAT section 10), written through C5. Background updates (executor
 * activity, the parallel brief draft, a pause notice) are queued; a failed queued write surfaces at
 * `flush`, so it is never lost.
 */
export class NowPublisher {
  private activities: Activity[] = [];
  private stepSinceMs: number;
  private parallel: string | null = null;
  private notice: string | null = null;
  private writes: Promise<void> = Promise.resolve();
  private writeError: unknown = null;

  constructor(private readonly options: NowPublisherOptions) {
    this.stepSinceMs = options.clock.now().getTime();
  }

  markStepStart(atMs: number): void {
    this.stepSinceMs = atMs;
  }

  report(activity: Omit<Activity, 'atMs'>): void {
    this.activities = [
      ...this.activities,
      { ...activity, atMs: this.options.clock.now().getTime(), text: clip(activity.text, textLimits.activityText) },
    ].slice(-NOW_ACTIVITY_LIMIT);
    this.queue();
  }

  setParallel(text: string | null): void {
    this.parallel = text === null ? null : clip(text, PARALLEL_TEXT_MAX);
    this.queue();
  }

  setNotice(text: string | null): void {
    this.notice = text === null ? null : clip(text, NOTICE_TEXT_MAX);
    this.queue();
  }

  async flush(): Promise<void> {
    await this.writes;
    const error = this.writeError;
    this.writeError = null;
    if (error !== null) throw error;
  }

  async publish(): Promise<void> {
    const cursor = this.options.cursor();
    if (cursor === null) return;
    const { clock, runId, pid, runDir } = this.options;
    await writeNowFile(runDir, {
      runId,
      pid,
      updatedAtMs: clock.now().getTime(),
      stageNumber: cursor.stageNumber,
      stageId: cursor.stageId,
      step: cursor.step,
      attempt: cursor.attempt,
      stepSinceMs: this.stepSinceMs,
      activities: this.activities,
      sessions: [],
      currentSession: null,
      parallel: this.parallel,
      notice: this.notice,
    });
  }

  private queue(): void {
    this.writes = this.writes
      .then(() => this.publish())
      .catch((error: unknown) => {
        this.writeError ??= error;
      });
  }
}
