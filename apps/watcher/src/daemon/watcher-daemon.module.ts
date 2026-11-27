import { Module, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PathsModule } from '@studio/core/paths';
import { RedactionModule } from '@studio/core/redaction';
import { WatcherAssetJobsModule } from '../asset-jobs/watcher-asset-jobs.module';
import { WatcherCurationModule } from '../curation/watcher-curation.module';
import { noMockFault } from '../mocks/mock-fault';
import { WatcherPlatformsModule } from '../platforms/watcher-platforms.module';
import { WatcherScheduleModule } from '../schedules/watcher-schedule.module';
import { WatcherModule } from '../watcher.module';
import { DaemonLoop } from './daemon-loop';
import { DAEMON_PROCESS, DAEMON_SHUTDOWN, type DaemonProcess } from './daemon.settings';
import { HeartbeatWriter } from './heartbeat-writer';
import { RunScanner } from './run-scanner';
import { WatcherDatabaseAccessModule } from './watcher-database-access.module';

export interface WatcherDaemonModuleOptions {
  /** Fires on SIGTERM/SIGINT (`installShutdownSignals`). */
  shutdown: AbortSignal;
}

/**
 * Composition root of the launchd daemon (SPEC 0002 R1-09, D17): a standalone Nest application
 * context, booted by `src/main.ts` with `NestFactory.createApplicationContext`. The graph holds
 * no controller and no HTTP adapter, so it never opens a port. SQLite is read only (ADR 0003
 * writer table), enforced by `WatcherDatabaseAccessModule` (`PRAGMA query_only = ON`, no database
 * created): the catalog selection brings `CatalogReadModule` (query handlers only) and core
 * `AgentsModule` (R1-12, with the R1-13 read-only tool set and `CostsReadModule`); with
 * `PathsModule` and `RedactionModule`, no command handler is registered anywhere in the graph.
 * `CqrsModule.forRoot()` provides the QueryBus those query handlers and the agent tools use; the
 * CommandBus it also provides has no handler to reach. The ledger and provider mode are core
 * (R1-11) and the stage executors are R1-14's, which also read the catalog through that QueryBus;
 * the dev fixture keeps the `mock` selection. `HeartbeatWriter` (rev 4, section 13.3) beats from
 * bootstrap until the context closes; it exists only here, so the dev fixture writes no heartbeat.
 * `WatcherCurationModule` (SPEC 0005 C5-04) hosts the Curator for the loop's curation step; it is
 * read-only toward SQLite and the catalog too, and writes only inside `curations/<id>/`.
 * `WatcherScheduleModule` (SPEC 0006 R3-04) hosts the schedule step the loop calls before
 * curations; it reads SQLite only through core `SchedulesReadModule`, writes `cursor.json` and
 * `slots.jsonl`, and creates one `run.json` at `pending` per fired slot. It shares the engine's
 * `CLOCK` through the same `WatcherModule` registration object.
 * `WatcherPlatformsModule` (SPEC 0007 R4-03) hosts the publish step the loop calls first between
 * runs and the metrics poll it calls after the schedule step; it reads SQLite only, through core
 * `PlatformsReadModule` and two `findMany`/`findUnique` reads, and writes its own platform files,
 * `publications.jsonl` and, on refresh under `token.lock`, the Keychain item. It shares the same
 * `CLOCK`.
 * `WatcherAssetJobsModule` (guided-creation design sections 1, 2 and 4) hosts the asset-job step the
 * loop calls after curations; it reads SQLite only through core `AssetJobsReadModule` and the
 * catalog query handlers, shares the catalog resolver, stage settings and reference analyst through
 * the same `WatcherModule` registration object, and writes only inside `asset-jobs/<kind>/<ref>/`.
 */
@Module({})
export class WatcherDaemonModule {
  static register(options: WatcherDaemonModuleOptions): DynamicModule {
    const watcher = WatcherModule.register({ ports: { kind: 'catalog', fault: noMockFault, agents: 'core' }, shutdown: options.shutdown });
    return {
      module: WatcherDaemonModule,
      imports: [
        WatcherDatabaseAccessModule.register(),
        CqrsModule.forRoot(),
        watcher,
        PathsModule,
        RedactionModule,
        WatcherCurationModule.register({ stop: options.shutdown }),
        WatcherScheduleModule.register({ clock: watcher }),
        WatcherPlatformsModule.register({ clock: watcher }),
        WatcherAssetJobsModule.register({ stop: options.shutdown, ports: watcher }),
      ],
      providers: [
        { provide: DAEMON_SHUTDOWN, useValue: options.shutdown },
        { provide: DAEMON_PROCESS, useValue: { pid: process.pid } satisfies DaemonProcess },
        RunScanner,
        DaemonLoop,
        HeartbeatWriter,
      ],
    };
  }
}
