import { Module, type DynamicModule } from '@nestjs/common';
import { CuratorAgentModule, CuratorAgentService, OutputScanner } from '@studio/core/agents';
import { CostLedgerService, CostsReadModule, CurationCostLedger } from '@studio/core/costs';
import { CurationReadModule } from '@studio/core/curation';
import { PathsModule } from '@studio/core/paths';
import { ProvidersModule } from '@studio/core/providers';
import { RedactionModule } from '@studio/core/redaction';
import { SystemClock } from '../engine/clock';
import { CurationEventRecorder } from './curation-event.recorder';
import { CurationPipeline } from './curation-pipeline';
import { CurationScanner } from './curation-scanner';
import { CurationSpendGuard } from './curation-spend.guard';
import { CurationStep } from './curation-step';
import { CURATION_CLOCK, CURATION_PROCESS, CURATION_STOP, CURATOR, type CurationProcess } from './curation.tokens';

export interface WatcherCurationModuleOptions {
  /** The daemon's SIGTERM/SIGINT signal; a running curation ends `failed` / `watcher-stopped` on it. */
  stop: AbortSignal;
}

/**
 * The Curator's host (SPEC 0005 section 5.2, D17, D18): read side only, as ADR 0003 requires of
 * the watcher. `CurationReadModule` (store, subject selector, evidence collector, ground-check
 * lookups) registers no handler; `CostsReadModule` gives the month-to-date figure and the C6
 * `CurationCostLedger`, which writes only `curations/<id>/cost.json`; `CuratorAgentModule` builds
 * the tool-less Curator with that ledger and the `CostLedgerService` price table, both bound with
 * `useExisting` from `CostsReadModule`, so the graph keeps one instance of each. No command handler
 * and no Prisma write is reachable from here. Exports `CurationStep` for the daemon loop only.
 */
@Module({})
export class WatcherCurationModule {
  static register(options: WatcherCurationModuleOptions): DynamicModule {
    return {
      module: WatcherCurationModule,
      imports: [
        PathsModule,
        ProvidersModule,
        RedactionModule,
        CostsReadModule,
        CurationReadModule,
        CuratorAgentModule.register({ imports: [CostsReadModule], curationCost: CurationCostLedger, pricing: CostLedgerService }),
      ],
      providers: [
        { provide: CURATION_STOP, useValue: options.stop },
        { provide: CURATION_PROCESS, useValue: { pid: process.pid } satisfies CurationProcess },
        { provide: CURATION_CLOCK, useClass: SystemClock },
        { provide: CURATOR, useExisting: CuratorAgentService },
        CurationEventRecorder,
        CurationScanner,
        OutputScanner,
        CurationSpendGuard,
        CurationPipeline,
        CurationStep,
      ],
      exports: [CurationStep],
    };
  }
}
