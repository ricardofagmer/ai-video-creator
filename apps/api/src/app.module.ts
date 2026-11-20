import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '@studio/core/catalog';
import { ComparisonsModule } from '@studio/core/comparisons';
import { CostsModule } from '@studio/core/costs';
import { CurationModule } from '@studio/core/curation';
import { LearningsModule } from '@studio/core/learnings';
import { MetricsModule } from '@studio/core/metrics';
import { PrismaModule } from '@studio/core/prisma';
import { PromotionModule } from '@studio/core/promotion';
import { QualityModule } from '@studio/core/quality';
import { RecipesModule } from '@studio/core/recipes';
import { ReviewModule } from '@studio/core/review';
import { RunsModule } from '@studio/core/runs';
import { SchedulesModule } from '@studio/core/schedules';
import { AuthModule } from './auth/auth.module';
import { CatalogApiModule } from './catalog/catalog-api.module';
import { ComparisonsApiModule } from './comparisons/comparisons-api.module';
import { CurationsApiModule } from './curations/curations-api.module';
import { HealthModule } from './health/health.module';
import { MetricsApiModule } from './metrics/metrics-api.module';
import { ApiExceptionFilter } from './platform/api-exception.filter';
import { AccessLogMiddleware, CorrelationMiddleware, HostOriginMiddleware, SecurityHeadersMiddleware } from './platform/http.middleware';
import { PlatformModule } from './platform/platform.module';
import { RecipesApiModule } from './recipes/recipes-api.module';
import { RunsApiModule } from './runs/runs-api.module';
import { SchedulesApiModule } from './schedules/schedules-api.module';
import { SearchApiModule } from './search/search-api.module';
import { WatcherApiModule } from './watcher/watcher-api.module';

/**
 * Composition root of the api (A9, ADR 0003). Core modules register their CQRS handlers on the
 * one bus `CqrsModule.forRoot()` creates; the `*ApiModule`s hold only controllers and readers.
 * No module here publishes to a platform: the api has no outbound integration.
 * Rev 3 (SPEC 0003): the api is the only process that imports `PromotionModule` (B19, R2-AC-21)
 * and the writer of learnings and comparisons. The embeddings module is composed once, inside
 * `EmbeddingsApiModule`, with the in-process ONNX adapter. `LearningsReadModule` is not imported:
 * `LearningsModule` already registers the read query handler.
 * Rev 4 (SPEC 0005): the api is the only process that imports `CurationModule` (request, decision,
 * get, list); the watcher imports `CurationReadModule` and no agent module is composed here (K1).
 * Rev 5 (SPEC 0006): the api writes publications, snapshots and imports through `MetricsModule`
 * and `schedule.json` through `SchedulesModule`; the watcher imports neither (it uses
 * `SchedulesReadModule`). No R3 route fetches a URL, publishes, sets a run status, or writes a
 * schedule's `cursor.json` or `slots.jsonl` (ADR 0003, K2, K6).
 */
@Module({
  imports: [
    CqrsModule.forRoot(),
    PlatformModule,
    PrismaModule,
    CatalogModule,
    RecipesModule,
    RunsModule,
    CostsModule,
    ReviewModule,
    QualityModule,
    PromotionModule,
    LearningsModule,
    ComparisonsModule,
    CurationModule,
    MetricsModule,
    SchedulesModule,
    AuthModule,
    HealthModule,
    CatalogApiModule,
    RecipesApiModule,
    RunsApiModule,
    WatcherApiModule,
    SearchApiModule,
    ComparisonsApiModule,
    CurationsApiModule,
    MetricsApiModule,
    SchedulesApiModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule implements NestModule {
  /**
   * Order matters: the correlation id and request context come first so every later step (and
   * the guard, pipes and filter) logs under it; Host/Origin refusals happen before any route.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationMiddleware, SecurityHeadersMiddleware, HostOriginMiddleware, AccessLogMiddleware)
      .forRoutes('{*splat}');
  }
}
