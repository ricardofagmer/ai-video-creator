import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '../catalog/catalog.module';
import { CostsModule } from '../costs/costs.module';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { RecipesModule } from '../recipes/recipes.module';
import { RunsModule } from '../runs/runs.module';
import { CreateComparisonHandler } from './commands/create-comparison.handler';
import { StartComparisonHandler } from './commands/start-comparison.handler';
import { ComparisonEstimateService } from './comparison-estimate.service';
import { ComparisonLocks } from './comparison-locks';
import { ComparisonRepository } from './comparison.repository';
import { ComparisonRunsReader } from './comparison-runs.reader';
import { ComparisonSubjectResolver } from './comparison-subject.resolver';
import { ComparisonViewAssembler } from './comparison-view.assembler';
import { GetComparisonHandler } from './queries/get-comparison.handler';
import { ListComparisonsHandler } from './queries/list-comparisons.handler';
import { VariantRecipeService } from './variant-recipe.service';

/**
 * A/B comparisons (SPEC 0003 section 5.3): two ordinary R1 runs from one brief that differ only in
 * the compared version, and the gate on their doubled spend. For the api only (B19: web-only in
 * R2; ADR 0003: the watcher never imports it and does not know a run belongs to a comparison).
 * Runs, recipe versions and catalog reads go through the CQRS buses of the modules imported here;
 * the cost ledger and provider modes are read, never changed. Nothing is exported.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, CatalogModule, RecipesModule, RunsModule, CostsModule, ProvidersModule],
  providers: [
    ComparisonRepository,
    ComparisonRunsReader,
    ComparisonEstimateService,
    ComparisonSubjectResolver,
    VariantRecipeService,
    ComparisonViewAssembler,
    ComparisonLocks,
    CreateComparisonHandler,
    StartComparisonHandler,
    GetComparisonHandler,
    ListComparisonsHandler,
  ],
})
export class ComparisonsModule {}
