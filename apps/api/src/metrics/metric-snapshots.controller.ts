import { Body, Controller, HttpCode, Param, Put } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SaveMetricSnapshotCommand } from '@studio/core/metrics';
import {
  MetricSnapshotParamsSchema,
  SaveMetricSnapshotRequestSchema,
  apiRouteSegments,
  type MetricSnapshotParams,
  type MetricSnapshotView,
  type SaveMetricSnapshotRequest,
} from '@studio/shared/api';
import { RequestContext } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { MetricsResponseAssembler } from './metrics-response.assembler';

/**
 * The manual metrics form (SPEC 0006 sections 4.4, 5.2; C10 rev 5): one `PlatformMetrics` body per
 * publication and day, saved with source `form`; the same key replaces the earlier form snapshot.
 * Behind the session guard and the `Origin` allowlist; `correlationId` comes from `x-request-id`.
 * Metric values are passed to core and never logged here (K7).
 */
@Controller(apiRouteSegments.runs)
export class MetricSnapshotsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly context: RequestContext,
    private readonly views: MetricsResponseAssembler,
  ) {}

  /** 404 `publication-not-found`; 422 `metrics-as-of-in-future`, `metrics-snapshot-limit-reached`. */
  @Put(`:runId/${apiRouteSegments.publications}/:publicationId/${apiRouteSegments.metrics}/:asOfDate`)
  @HttpCode(200)
  async save(
    @Param(new ZodValidationPipe(MetricSnapshotParamsSchema)) params: MetricSnapshotParams,
    @Body(new ZodValidationPipe(SaveMetricSnapshotRequestSchema)) body: SaveMetricSnapshotRequest,
  ): Promise<MetricSnapshotView> {
    const view = await this.commandBus.execute(
      new SaveMetricSnapshotCommand({
        runId: params.runId,
        publicationId: params.publicationId,
        asOfDate: params.asOfDate,
        metrics: body,
        correlationId: this.context.correlationId(),
      }),
    );
    return this.views.snapshot(view);
  }
}
