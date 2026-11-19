import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QualityScoreRepository } from './quality-score.repository';
import { QualityScoreService } from './quality-score.service';

/**
 * Quality score (SPEC 0003 section 5.1, PRD 8 step 2): the only writer of the score columns. For
 * the api and the CLI only (ADR 0003 single-writer rule): the review module imports it to rescore
 * after a final review, the metrics module after a publication, form snapshot or import (SPEC 0006
 * section 5.4), and the CLI's `studio catalog rescore` reaches it through
 * `@studio/core/quality`. The watcher never imports it (R2-AC-03).
 */
@Module({
  imports: [PrismaModule],
  providers: [QualityScoreRepository, QualityScoreService],
  exports: [QualityScoreService],
})
export class QualityModule {}
