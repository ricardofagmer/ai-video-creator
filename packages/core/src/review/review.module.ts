import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '../catalog/catalog.module';
import { OutcomesModule } from '../outcomes/outcomes.module';
import { PathsModule } from '../paths/paths.module';
import { QualityModule } from '../quality/quality.module';
import { BiometricRunGuard } from './biometric-guard';
import { PromoteFromRunHandler } from './commands/promote-from-run.handler';
import { RecordGateDecisionHandler } from './commands/record-gate-decision.handler';
import { RecordReviewDecisionHandler } from './commands/record-review-decision.handler';
import { RequestRunControlHandler } from './commands/request-run-control.handler';
import { ReviewRunAccess } from './review-run-access';
import { RunLocks } from './run-locks';

/**
 * Human decisions on a run (R1-17, ADR 0003 "Who writes what"), for the api and the CLI only:
 * gate answers and the final review in approval.json, `review` -> `approved` / `rejected`,
 * control.json requests and promote-from-run. Nothing is exported; callers go through the CQRS
 * buses (the composition root registers `CqrsModule.forRoot()`). The watcher never imports it.
 * A recorded final review rescores the catalog through `QualityModule` (SPEC 0003 section 5.1).
 */
@Module({
  imports: [CqrsModule, PathsModule, CatalogModule, OutcomesModule, QualityModule],
  providers: [
    BiometricRunGuard,
    ReviewRunAccess,
    RunLocks,
    RecordReviewDecisionHandler,
    RecordGateDecisionHandler,
    RequestRunControlHandler,
    PromoteFromRunHandler,
  ],
})
export class ReviewModule {}
