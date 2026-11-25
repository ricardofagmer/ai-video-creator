import { homedir } from 'node:os';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetJobsModule } from '@studio/core/asset-jobs';
import { PathsModule } from '@studio/core/paths';
import { QualityModule } from '@studio/core/quality';
import { AssetJobCostIndexSync } from './asset-job-cost-index.service';
import { AssetJobViewAssembler } from './asset-job-view.assembler';
import { AssetJobsController } from './asset-jobs.controller';
import { AssetPurposeController } from './asset-purpose.controller';
import { AssetPurposeBackfillController } from './asset-purpose-backfill.controller';
import { AssetPurposeEditController } from './asset-purpose-edit.controller';
import { CatalogController } from './catalog.controller';
import { CatalogReferenceService } from './catalog-reference.service';
import { CatalogUploadService } from './catalog-upload.service';
import { CatalogVersionDecisionsController } from './catalog-version-decisions.controller';
import { CatalogViewsModule } from './catalog-views.module';
import { QualityFormulaReconciler } from './quality-formula.reconciler';
import { ReferencePathValidator } from './reference-path.validator';
import { ReferenceRoots } from './reference-roots';
import { TemplatePreviewBackfill } from './template-preview.backfill';
import { VoiceSampleAudioStreamer } from './voice-sample-audio.streamer';
import { AudioContentStreamer } from './audio-content.streamer';
import { ImageContentStreamer } from './image-content.streamer';

/**
 * Http side of the catalog; the handlers come from core `CatalogModule`, `PromotionModule` and
 * `LearningsModule`, imported by the root. `QualityModule` supplies the formula-version check run
 * at start (SPEC 0003 section 5.1). `AssetJobsModule` (guided-creation design sections 2 and 4)
 * registers the asset job handlers and supplies `ReferenceAnalysisEnqueuer` to the save paths;
 * `IndexAssetJobCostCommand` comes from core `CostsModule`, imported by the root.
 * `AssetPurposeController` (ADR 0012) asks for a new purpose; `AssetJobsModule` supplies its command
 * and the save-time `AssetPurposeEnqueuer`.
 */
@Module({
  imports: [CqrsModule, PathsModule, QualityModule, CatalogViewsModule, AssetJobsModule],
  controllers: [CatalogController, CatalogVersionDecisionsController, AssetJobsController, AssetPurposeController, AssetPurposeEditController, AssetPurposeBackfillController],
  providers: [
    AssetJobViewAssembler,
    AssetJobCostIndexSync,
    VoiceSampleAudioStreamer,
    ImageContentStreamer,
    AudioContentStreamer,
    CatalogUploadService,
    CatalogReferenceService,
    ReferencePathValidator,
    QualityFormulaReconciler,
    TemplatePreviewBackfill,
    { provide: ReferenceRoots, useFactory: (): ReferenceRoots => new ReferenceRoots(homedir()) },
  ],
})
export class CatalogApiModule {}
