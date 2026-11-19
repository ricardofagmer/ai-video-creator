import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RunOutcomeRecorder } from './run-outcome.recorder';
import { RunOutcomeRepository } from './run-outcome.repository';

/**
 * Outcomes of reviewed runs (PRD 8 item 1, R1-17): the R1 half of the improvement loop. Only the
 * review module writes them, through `RunOutcomeRecorder`; the watcher never imports this module.
 */
@Module({
  imports: [PrismaModule],
  providers: [RunOutcomeRepository, RunOutcomeRecorder],
  exports: [RunOutcomeRecorder],
})
export class OutcomesModule {}
