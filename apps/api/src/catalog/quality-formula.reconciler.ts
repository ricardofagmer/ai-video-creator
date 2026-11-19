import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { QualityScoreService } from '@studio/core/quality';

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

/**
 * SPEC 0003 section 5.1: at api start, the stored `quality.formula-version` is compared with the
 * shared formula version and the catalog is rescored when they differ. Runs in the background so a
 * large catalog never delays the listener; a failure is logged and the next trigger repairs it.
 */
@Injectable()
export class QualityFormulaReconciler implements OnApplicationBootstrap {
  private readonly logger = new Logger(QualityFormulaReconciler.name);

  constructor(private readonly quality: QualityScoreService) {}

  onApplicationBootstrap(): void {
    void this.reconcile();
  }

  private async reconcile(): Promise<void> {
    try {
      const outcome = await this.quality.reconcileFormulaVersion();
      this.logger.log({ event: 'quality.formula-checked', outcome });
    } catch (error) {
      this.logger.error({ event: 'quality.recompute-failed', trigger: 'formula-version', errorName: errorName(error) });
    }
  }
}
