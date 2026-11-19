import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssetVersionRepository } from '../catalog/asset-version.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { RecipeVersionRepository } from '../recipes/recipe-version.repository';
import { RedactionModule } from '../redaction/redaction.module';
import { PromoteVersionHandler } from './promote-version.handler';
import { PromotionApprovalRepository } from './promotion-approval.repository';
import { GetVersionActivationsHandler } from './queries/get-version-activations.handler';

/**
 * Promotion (SPEC 0003 section 5.4, criterion 35): the single path to `status = 'active'`, each
 * activation recorded as one append-only owner approval. Composition rule (B19, R2-AC-21): only
 * `apps/api` imports this module, through `@studio/core/promotion`. The watcher and the CLI never
 * import it, and no timer, scheduler, queue consumer, event handler or agent tool dispatches its
 * command. Callers go through the CQRS buses; the root registers `CqrsModule.forRoot()`.
 */
@Module({
  imports: [CqrsModule, PrismaModule, RedactionModule],
  providers: [AssetVersionRepository, RecipeVersionRepository, PromotionApprovalRepository, PromoteVersionHandler, GetVersionActivationsHandler],
})
export class PromotionModule {}
