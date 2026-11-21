import { Module, type DynamicModule } from '@nestjs/common';
import { PathsModule } from '@studio/core/paths';
import { PlatformsReadModule } from '@studio/core/platforms';
import { PrismaModule } from '@studio/core/prisma';
import { MetricsPollStep } from './metrics-poll.step';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PlatformHealthWriter } from './platform-health.writer';
import { PlatformTokenSession } from './platform-token.session';
import { PublicationAttemptReader } from './publication-attempt.reader';
import { PublicationTargetsReader } from './publication-targets.reader';
import { PublishAttemptFiles } from './publish-attempt.files';
import { PublishCloser } from './publish-closer';
import { PublishFollowUp } from './publish-follow-up';
import { PublishRecheck } from './publish-recheck';
import { PublishUploader } from './publish-uploader';
import { PublishStep } from './publish.step';
import { RunApprovalReader } from './run-approval.reader';

export interface WatcherPlatformsModuleOptions {
  /**
   * The module that exports the engine's `CLOCK`: the daemon passes its own `WatcherModule`
   * registration (the same object, so the same instance), so uploads, polls, schedules, runs and
   * the heartbeat share one clock and a test can move it.
   */
  clock: DynamicModule;
}

/**
 * The watcher's platform steps (SPEC 0007 R4-03, sections 5.5 and 5.7): the publish step the daemon
 * loop calls first between runs and the metrics poll it calls after the schedule step. Core
 * `PlatformsReadModule` gives the read-only stores, the status reader, the client registry (mock by
 * default, so zero outbound requests in mock mode), the Keychain vault and `token.lock`; it registers
 * no command or query handler. SQLite is read only (`run_outcomes`, `run_publications`,
 * `publication_attempts`), never written (K1, AC 57). The watcher's own writes, all through `@studio/shared/platforms/files` and
 * `@studio/shared/run-files`: `claim`, `state.json`, `health.json`, `polls/cursor.json`, the metrics
 * inbox batch files and `runs/<runId>/publications.jsonl`, plus the Keychain item on refresh under
 * `token.lock`. Nothing here writes `gates.json`, `account.json`, `request.json` or `cancel`, and no
 * code under `schedules/`, `curation/`, `stages/` or `engine/` references a publish request (AC 58).
 * Exports the two steps for the daemon loop only.
 */
@Module({})
export class WatcherPlatformsModule {
  static register(options: WatcherPlatformsModuleOptions): DynamicModule {
    return {
      module: WatcherPlatformsModule,
      imports: [options.clock, PathsModule, PrismaModule, PlatformsReadModule],
      providers: [
        PlatformEventRecorder,
        PlatformHealthWriter,
        PlatformTokenSession,
        PublishAttemptFiles,
        RunApprovalReader,
        PublicationAttemptReader,
        PublishRecheck,
        PublishCloser,
        PublishFollowUp,
        PublishUploader,
        PublishStep,
        PublicationTargetsReader,
        MetricsPollStep,
      ],
      exports: [PublishStep, MetricsPollStep],
    };
  }
}
