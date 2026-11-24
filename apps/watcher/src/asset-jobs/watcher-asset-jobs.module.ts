import { Module, type DynamicModule } from '@nestjs/common';
import { AssetJobCostService, AssetJobsReadModule } from '@studio/core/asset-jobs';
import { PathsModule } from '@studio/core/paths';
import { ProvidersModule } from '@studio/core/providers';
import { RedactionModule } from '@studio/core/redaction';
import { SystemClock } from '../engine/clock';
import { AssetJobScanner } from './asset-job-scanner';
import { AssetJobSpend } from './asset-job-spend';
import { AssetJobStep } from './asset-job-step';
import { ASSET_JOB_COST, ASSET_JOBS_CLOCK, ASSET_JOBS_PROCESS, ASSET_JOBS_STOP, type AssetJobProcess } from './asset-jobs.tokens';
import { ReferenceAnalysisHandler } from './reference-analysis.handler';
import { VoiceSampleHandler } from './voice-sample.handler';

export interface WatcherAssetJobsModuleOptions {
  /** The daemon's shutdown signal (`installShutdownSignals`). */
  stop: AbortSignal;
  /**
   * The daemon's `WatcherModule` registration object (catalog selection, core agents), imported
   * as-is so the step shares its instances: `ASSET_RESOLVER` (the catalog resolver, read-only, full
   * re-hash), `STAGE_SETTINGS` (ffmpeg, ffprobe, local voice, ElevenLabs voice id) and
   * `REFERENCE_ANALYST` (core `ReferenceAnalystService`). A second `AgentsModule.register` here
   * would build a second agent graph.
   */
  ports: DynamicModule;
}

/**
 * The watcher's asset-job step (docs/specs/2026-11-23-guided-creation-design.md sections 1, 2 and
 * 4). Read side only: `AssetJobsReadModule` brings the store, the reader and the cost service, and
 * registers no command handler; the step writes only `asset-jobs/<kind>/<ref>/` (job.json, the
 * sample clip, egress.jsonl, cost.json) and never SQLite or the catalog (ADR 0003). The catalog
 * version is read through the root's QueryBus (`CqrsModule.forRoot()` in the daemon root).
 * Exports only the step, which the daemon loop calls between runs.
 */
@Module({})
export class WatcherAssetJobsModule {
  static register(options: WatcherAssetJobsModuleOptions): DynamicModule {
    return {
      module: WatcherAssetJobsModule,
      imports: [options.ports, PathsModule, ProvidersModule, RedactionModule, AssetJobsReadModule],
      providers: [
        { provide: ASSET_JOBS_STOP, useValue: options.stop },
        { provide: ASSET_JOBS_PROCESS, useValue: { pid: process.pid } satisfies AssetJobProcess },
        { provide: ASSET_JOBS_CLOCK, useClass: SystemClock },
        { provide: ASSET_JOB_COST, useExisting: AssetJobCostService },
        AssetJobScanner,
        AssetJobSpend,
        VoiceSampleHandler,
        ReferenceAnalysisHandler,
        AssetJobStep,
      ],
      exports: [AssetJobStep],
    };
  }
}
