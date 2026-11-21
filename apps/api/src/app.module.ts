import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogModule } from '@studio/core/catalog';
import { ComparisonsModule } from '@studio/core/comparisons';
import { CostsModule } from '@studio/core/costs';
import { CurationModule } from '@studio/core/curation';
import { InsightsModule } from '@studio/core/insights';
import { LearningsModule } from '@studio/core/learnings';
import { MetricsModule } from '@studio/core/metrics';
import { PlatformsModule } from '@studio/core/platforms';
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
import { ConnectionsApiModule } from './connections/connections-api.module';
import { CurationsApiModule } from './curations/curations-api.module';
import { HealthModule } from './health/health.module';
import { InsightsApiModule } from './insights/insights-api.module';
import { MetricsApiModule } from './metrics/metrics-api.module';
import { ApiExceptionFilter } from './platform/api-exception.filter';
import { AccessLogMiddleware, CorrelationMiddleware, HostOriginMiddleware, SecurityHeadersMiddleware } from './platform/http.middleware';
import { PlatformModule } from './platform/platform.module';
import { PublishingApiModule } from './publishing/publishing-api.module';
import { RecipesApiModule } from './recipes/recipes-api.module';
import { RunsApiModule } from './runs/runs-api.module';
import { SchedulesApiModule } from './schedules/schedules-api.module';
import { SearchApiModule } from './search/search-api.module';
import { WatcherApiModule } from './watcher/watcher-api.module';

/**
 * Composition root of the api (A9, ADR 0003). Core modules register their CQRS handlers on the
 * one bus `CqrsModule.forRoot()` creates; the `*ApiModule`s hold only controllers and readers.
 * The api uploads nothing: no module here sends video bytes to a platform (SPEC 0007 L2).
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
 * Rev 7 (SPEC 0007): the api imports `PlatformsModule` (gates, connect, disconnect, `RequestPublish`,
 * cancel, `PublishAttemptSync`, the in-memory OAuth `state` store); the watcher imports
 * `PlatformsReadModule`. The api calls a platform only inside connect (code exchange, one identity
 * call) and disconnect (one best-effort revoke), through core's clients; a publish route only
 * records the owner's request and the watcher uploads between runs (K4, AC 52). The api writes
 * `gates.json`, `account.json`, `request.json` and `cancel` through core, and never `health.json`,
 * `claim`, `state.json`, `cursor.json` or `publications.jsonl` (K2, AC 57).
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
    InsightsModule,
    PlatformsModule,
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
    InsightsApiModule,
    ConnectionsApiModule,
    PublishingApiModule,
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
