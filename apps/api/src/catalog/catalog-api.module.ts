import { homedir } from 'node:os';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PathsModule } from '@studio/core/paths';
import { QualityModule } from '@studio/core/quality';
import { CatalogController } from './catalog.controller';
import { CatalogReferenceService } from './catalog-reference.service';
import { CatalogUploadService } from './catalog-upload.service';
import { CatalogVersionDecisionsController } from './catalog-version-decisions.controller';
import { CatalogViewsModule } from './catalog-views.module';
import { QualityFormulaReconciler } from './quality-formula.reconciler';
import { ReferencePathValidator } from './reference-path.validator';
import { ReferenceRoots } from './reference-roots';

/**
 * Http side of the catalog; the handlers come from core `CatalogModule`, `PromotionModule` and
 * `LearningsModule`, imported by the root. `QualityModule` supplies the formula-version check run
 * at start (SPEC 0003 section 5.1).
 */
@Module({
  imports: [CqrsModule, PathsModule, QualityModule, CatalogViewsModule],
  controllers: [CatalogController, CatalogVersionDecisionsController],
  providers: [
    CatalogUploadService,
    CatalogReferenceService,
    ReferencePathValidator,
    QualityFormulaReconciler,
    { provide: ReferenceRoots, useFactory: (): ReferenceRoots => new ReferenceRoots(homedir()) },
  ],
})
export class CatalogApiModule {}
