import { Module } from '@nestjs/common';
import { CostsReadModule } from '../costs/costs-read.module';
import { PathsModule } from '../paths/paths.module';
import { AssetJobCostService } from './asset-job-cost.service';
import { AssetJobStore } from './asset-job-store';
import { ReferenceAnalysisReader } from './reference-analysis.reader';

/**
 * Read side of asset jobs for the watcher (ADR 0003): the store over `asset-jobs/`, the analysis
 * reader of the `script` stage and the cost port. It registers no command or query handler. The
 * watcher writes job files only through `@studio/shared/asset-jobs/files`; `AssetJobCostService`
 * writes cost.json only and reads SQLite only (spec Amendment 3), so the watcher binds it as
 * `AssetJobCostPort`. The api imports `AssetJobsModule` instead; never import both in one root.
 */
@Module({
  imports: [PathsModule, CostsReadModule],
  providers: [AssetJobStore, ReferenceAnalysisReader, AssetJobCostService],
  exports: [AssetJobStore, ReferenceAnalysisReader, AssetJobCostService],
})
export class AssetJobsReadModule {}
