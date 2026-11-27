import { Controller, HttpCode, Inject, Logger, Post, Query, Req } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ImportMetricsCommand, MetricImportRefusedError } from '@studio/core/metrics';
import { MetricImportQuerySchema, apiRouteSegments, type MetricImportReport } from '@studio/shared/api';
import { decodeCsvBytes, type Platform } from '@studio/shared/metrics';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { type MultipartSource } from '../catalog/multipart-parts';
import { MetricsFileTooLargeError } from '../platform/api.errors';
import { RequestContext, type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { receiveMetricImport, type ReceivedMetricImport } from './metric-import.upload';
import { MetricsResponseAssembler } from './metrics-response.assembler';

type ImportQuery = z.output<typeof MetricImportQuerySchema>;

/** The one command this controller dispatches (the command bus satisfies it). */
export interface MetricImportCommandPort {
  execute(command: ImportMetricsCommand): Promise<MetricImportReport>;
}

/**
 * CSV imports of platform metrics (SPEC 0006 sections 4.4, 5.3; C10 rev 5). Behind the session
 * guard and the `Origin` allowlist. The upload is received in memory with the 5.3 limits and never
 * written to disk; the receive and decode refusals (size, zip, NUL byte, not UTF-8, empty) answer
 * before anything reaches core. `importedBy` comes from the session and `correlationId` from
 * `x-request-id`. Logs carry the platform, the reason, the byte count and the correlation id only:
 * never the file name, the declared content type or a cell (K7).
 */
@Controller(apiRouteSegments.metricImports)
export class MetricImportsController {
  private readonly logger = new Logger(MetricImportsController.name);

  constructor(
    @Inject(CommandBus) private readonly commands: MetricImportCommandPort,
    private readonly context: RequestContext,
    private readonly views: MetricsResponseAssembler,
  ) {}

  /**
   * Multipart `platform`, `asOfDate`, then `file`; `dryRun=true` reads and plans and writes nothing.
   * 413 `metrics-file-too-large`; 422 `metrics-not-csv`, `metrics-too-many-rows`,
   * `metrics-required-column-missing`, `metrics-empty-file`, `metrics-as-of-in-future`.
   */
  @Post()
  @HttpCode(200)
  async importCsv(
    @Req() request: MultipartSource,
    @Query(new ZodValidationPipe(MetricImportQuerySchema)) query: ImportQuery,
    @CurrentPrincipal() principal: Principal,
  ): Promise<MetricImportReport> {
    const upload = await this.receive(request);
    const report = await this.commands.execute(
      new ImportMetricsCommand({
        fields: upload.fields,
        dryRun: query.dryRun ?? false,
        file: upload.file,
        importedBy: principal.subject,
        correlationId: this.context.correlationId(),
      }),
    );
    return this.views.importReport(report);
  }

  /** The receive and decode stages; a refusal is logged once here and nothing reaches core. */
  private async receive(request: MultipartSource): Promise<ReceivedMetricImport> {
    let upload: ReceivedMetricImport;
    try {
      upload = await receiveMetricImport(request);
    } catch (error) {
      if (error instanceof MetricsFileTooLargeError) this.logRefused({ platform: null, reason: 'file-too-large', fileBytes: null });
      throw error;
    }
    const decoded = decodeCsvBytes(upload.file);
    if (decoded.status === 'refused') {
      this.logRefused({ platform: upload.fields.platform, reason: decoded.reason, fileBytes: upload.file.length });
      throw new MetricImportRefusedError(decoded.reason, upload.fields.platform);
    }
    return upload;
  }

  private logRefused(facts: { platform: Platform | null; reason: string; fileBytes: number | null }): void {
    this.logger.warn({ event: 'metrics.import-refused', ...facts, correlationId: this.context.correlationId() });
  }
}
