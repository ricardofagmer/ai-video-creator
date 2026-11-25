import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetPurposeSync } from '../catalog/asset-purpose.sync';
import { AssetVersionRepository } from '../catalog/asset-version.repository';
import { CatalogModule } from '../catalog/catalog.module';
import { CostsModule } from '../costs/costs.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AssetJobCostService } from './asset-job-cost.service';
import { AssetJobRequester } from './asset-job-requester';
import { AssetJobStore } from './asset-job-store';
import { AssetJobVersions } from './asset-job-versions';
import { AssetPurposeEnqueuer } from './asset-purpose.enqueuer';
import { RequestAssetPurposeGenerationHandler } from './commands/request-asset-purpose-generation.handler';
import { RequestPurposeBackfillHandler } from './commands/request-purpose-backfill.handler';
import { RequestReferenceAnalysisHandler } from './commands/request-reference-analysis.handler';
import { RequestVoiceSampleHandler } from './commands/request-voice-sample.handler';
import { CountMissingPurposesHandler } from './queries/count-missing-purposes.handler';
import { GetAssetPurposeStatesHandler } from './queries/get-asset-purpose-states.handler';
import { GetReferenceAnalysisHandler } from './queries/get-reference-analysis.handler';
import { GetVoiceSampleAudioHandler } from './queries/get-voice-sample-audio.handler';
import { GetVoiceSampleHandler } from './queries/get-voice-sample.handler';
import { GetTemplatePreviewFileHandler } from './queries/get-template-preview-file.handler';
import { GetTemplatePreviewHandler } from './queries/get-template-preview.handler';
import { ReferenceAnalysisEnqueuer } from './reference-analysis.enqueuer';
import { TemplatePreviewEnqueuer } from './template-preview.enqueuer';

/**
 * Asset jobs for the api (guided-creation design sections 2 and 4): the voice sample and reference
 * analysis requests, their reads, and the save-time analysis enqueue. The api writes each
 * `job.json` only as `requested`; every later state is the watcher's. The composition root
 * registers `CqrsModule.forRoot()`; the watcher imports `AssetJobsReadModule` instead.
 *
 * The asset purpose (ADR 0012) adds its save-time enqueue, the generation command and the
 * copy-on-read states query. `AssetPurposeSync` and its repository are provided here, not by the
 * catalog module, so only the api root can write the purpose columns.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, CatalogModule, ProvidersModule, CostsModule],
  providers: [
    AssetJobStore,
    AssetJobVersions,
    AssetJobRequester,
    ReferenceAnalysisEnqueuer,
    TemplatePreviewEnqueuer,
    AssetPurposeEnqueuer,
    AssetVersionRepository,
    AssetPurposeSync,
    AssetJobCostService,
    RequestVoiceSampleHandler,
    RequestReferenceAnalysisHandler,
    GetVoiceSampleHandler,
    GetVoiceSampleAudioHandler,
    GetReferenceAnalysisHandler,
    GetTemplatePreviewHandler,
    GetTemplatePreviewFileHandler,
    RequestAssetPurposeGenerationHandler,
    GetAssetPurposeStatesHandler,
    CountMissingPurposesHandler,
    RequestPurposeBackfillHandler,
  ],
  exports: [ReferenceAnalysisEnqueuer, TemplatePreviewEnqueuer, AssetPurposeEnqueuer, AssetJobCostService],
})
export class AssetJobsModule {}
