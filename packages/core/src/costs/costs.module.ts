import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { IndexAssetJobCostHandler } from './commands/index-asset-job-cost.handler';
import { IndexCurationCostHandler } from './commands/index-curation-cost.handler';
import { IndexRunCostHandler } from './commands/index-run-cost.handler';
import { CostEntryRepository } from './cost-entry.repository';
import { CostIndexer } from './cost-indexer.service';
import { CostLedgerService } from './cost-ledger.service';
import { CurationCostLedger } from './curation-cost-ledger.service';
import { MonthToDateSpend } from './month-to-date.service';

/**
 * Cost accounting (R1-11, ADR 0002 "Cost"). The watcher binds `CostLedgerService` as C6
 * `CostLedgerPort`: it writes cost.json only and reads SQLite only. The api and the CLI dispatch
 * `IndexRunCostCommand` on the CQRS bus (the composition root registers `CqrsModule.forRoot()`),
 * which is the only writer of `cost_entries`, as with the catalog commands. SPEC 0005 adds
 * `IndexCurationCostCommand` (curation cost.json, `source_kind = 'curation'`) beside it, and the
 * guided-creation spec Amendment 3 adds `IndexAssetJobCostCommand` (`source_kind = 'asset-job'`).
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, ProvidersModule],
  providers: [
    CostEntryRepository,
    MonthToDateSpend,
    CostLedgerService,
    CurationCostLedger,
    CostIndexer,
    IndexRunCostHandler,
    IndexCurationCostHandler,
    IndexAssetJobCostHandler,
  ],
  exports: [CostLedgerService, CurationCostLedger],
})
export class CostsModule {}
