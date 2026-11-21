import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CostEntryRepository } from '../costs/cost-entry.repository';
import { MonthToDateSpend } from '../costs/month-to-date.service';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AttemptUploadEvidence } from './attempt-upload-evidence.reader';
import { InsightsRepository } from './insights.repository';
import { GetStudioInsightsHandler } from './queries/get-studio-insights.handler';
import { RunHistoryReader } from './run-history.reader';

/**
 * Studio insights (PRD 0001 R4 goal 4) for the api and the CLI: one read-only query over SQLite
 * and the run folders. It writes nothing, and the watcher never imports it. `MonthToDateSpend` is
 * provided here, read-only, so the month figure is the one the cost ceiling reads. The composition
 * root registers `CqrsModule.forRoot()`.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule],
  providers: [CostEntryRepository, MonthToDateSpend, AttemptUploadEvidence, InsightsRepository, RunHistoryReader, GetStudioInsightsHandler],
})
export class InsightsModule {}
