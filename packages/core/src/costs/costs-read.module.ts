import { Module } from '@nestjs/common';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { CostEntryRepository } from './cost-entry.repository';
import { CostLedgerService } from './cost-ledger.service';
import { CurationCostLedger } from './curation-cost-ledger.service';
import { MonthToDateSpend } from './month-to-date.service';

/**
 * Cost ledger for the watcher (ADR 0003, SPEC 0002 rev 2): `CostLedgerService` writes cost.json
 * only and reads `cost_entries` for month-to-date. Unlike `CostsModule` it registers no
 * `IndexRunCostHandler`, because indexing into SQLite belongs to the api and the CLI. The watcher
 * binds C6 `CurationCostPort` to the exported `CurationCostLedger` (SPEC 0005 section 5.8), which
 * writes `curations/<id>/cost.json` only; `IndexCurationCostHandler` is likewise absent here, and
 * so is `IndexAssetJobCostHandler` (asset job cost.json is written by `AssetJobCostService`).
 */
@Module({
  imports: [PathsModule, PrismaModule, ProvidersModule],
  providers: [CostEntryRepository, MonthToDateSpend, CostLedgerService, CurationCostLedger],
  exports: [CostLedgerService, CurationCostLedger],
})
export class CostsReadModule {}
