import { homedir } from 'node:os';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetJobsModule } from '@studio/core/asset-jobs';
import { PathsModule } from '@studio/core/paths';
import { QualityModule } from '@studio/core/quality';
import { AssetJobCostIndexSync } from './asset-job-cost-index.service';
import { AssetJobViewAssembler } from './asset-job-view.assembler';
import { AssetJobsController } from './asset-jobs.controller';
import { CatalogController } from './catalog.controller';
import { CatalogReferenceService } from './catalog-reference.service';
import { CatalogUploadService } from './catalog-upload.service';
import { CatalogVersionDecisionsController } from './catalog-version-decisions.controller';
import { CatalogViewsModule } from './catalog-views.module';
import { QualityFormulaReconciler } from './quality-formula.reconciler';
import { ReferencePathValidator } from './reference-path.validator';
import { ReferenceRoots } from './reference-roots';
import { VoiceSampleAudioStreamer } from './voice-sample-audio.streamer';
import { ImageContentStreamer } from './image-content.streamer';

/**
 * Http side of the catalog; the handlers come from core `CatalogModule`, `PromotionModule` and
 * `LearningsModule`, imported by the root. `QualityModule` supplies the formula-version check run
 * at start (SPEC 0003 section 5.1). `AssetJobsModule` (guided-creation design sections 2 and 4)
 * registers the asset job handlers and supplies `ReferenceAnalysisEnqueuer` to the save paths;
 * `IndexAssetJobCostCommand` comes from core `CostsModule`, imported by the root.
 */
@Module({
  imports: [CqrsModule, PathsModule, QualityModule, CatalogViewsModule, AssetJobsModule],
  controllers: [CatalogController, CatalogVersionDecisionsController, AssetJobsController],
  providers: [
    AssetJobViewAssembler,
    AssetJobCostIndexSync,
    VoiceSampleAudioStreamer,
    ImageContentStreamer,
    CatalogUploadService,
    CatalogReferenceService,
    ReferencePathValidator,
    QualityFormulaReconciler,
    { provide: ReferenceRoots, useFactory: (): ReferenceRoots => new ReferenceRoots(homedir()) },
  ],
})
export class CatalogApiModule {}
