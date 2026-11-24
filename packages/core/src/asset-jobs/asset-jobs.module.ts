import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '../catalog/catalog.module';
import { CostsModule } from '../costs/costs.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AssetJobCostService } from './asset-job-cost.service';
import { AssetJobRequester } from './asset-job-requester';
import { AssetJobStore } from './asset-job-store';
import { AssetJobVersions } from './asset-job-versions';
import { RequestReferenceAnalysisHandler } from './commands/request-reference-analysis.handler';
import { RequestVoiceSampleHandler } from './commands/request-voice-sample.handler';
import { GetReferenceAnalysisHandler } from './queries/get-reference-analysis.handler';
import { GetVoiceSampleAudioHandler } from './queries/get-voice-sample-audio.handler';
import { GetVoiceSampleHandler } from './queries/get-voice-sample.handler';
import { ReferenceAnalysisEnqueuer } from './reference-analysis.enqueuer';

/**
 * Asset jobs for the api (guided-creation design sections 2 and 4): the voice sample and reference
 * analysis requests, their reads, and the save-time analysis enqueue. The api writes each
 * `job.json` only as `requested`; every later state is the watcher's. The composition root
 * registers `CqrsModule.forRoot()`; the watcher imports `AssetJobsReadModule` instead.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, CatalogModule, ProvidersModule, CostsModule],
  providers: [
    AssetJobStore,
    AssetJobVersions,
    AssetJobRequester,
    ReferenceAnalysisEnqueuer,
    AssetJobCostService,
    RequestVoiceSampleHandler,
    RequestReferenceAnalysisHandler,
    GetVoiceSampleHandler,
    GetVoiceSampleAudioHandler,
    GetReferenceAnalysisHandler,
  ],
  exports: [ReferenceAnalysisEnqueuer, AssetJobCostService],
})
export class AssetJobsModule {}
