import { Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { AgentsModule, AgentsService } from '@studio/core/agents';
import { readOnlyAgentToolSet } from '@studio/core/agents/tools';
import { CatalogReadModule } from '@studio/core/catalog';
import { CostLedgerService, CostsReadModule } from '@studio/core/costs';
import { LearningNotesReader, LearningsReadModule } from '@studio/core/learnings';
import { ProviderModeService, ProvidersModule } from '@studio/core/providers';
import { catalogAssetResolverProvider } from './adapters/catalog/catalog-asset-resolver.adapter';
import { SystemClock, type WatcherProcess } from './engine/clock';
import { AGENTS, CLOCK, COST_LEDGER, LEARNING_NOTES, PROVIDER_MODE, WATCHER_PROCESS, enginePortTokens } from './engine/engine.tokens';
import { type MockFaultPlan } from './mocks/mock-fault';
import {
  mockAgentsProvider,
  mockAssetResolverProvider,
  mockCostLedgerProvider,
  mockFaultPlanProvider,
  mockLearningNotesProvider,
  mockProviderModeProvider,
  mockStageExecutorsProvider,
} from './mocks/mock-providers';
import { stageExecutorProviders } from './stages/stage-executors.providers';

/**
 * Selects what backs each port, named explicitly so that mock bindings are never a silent default.
 * - `mock`: every port on its R1-04 mock, with the in-memory fixture catalog (offline fixture,
 *   `dev:fixture`).
 * - `catalog`: assets resolve from the real catalog in SQLite (`CatalogReadModule`, read-only,
 *   full re-hash) and the bound-asset presence check runs (R1-06). `agents` picks the `AGENTS`
 *   binding: `core` is the R1-12 `AgentsService` with the R1-13 read-only tool set (the daemon,
 *   whose root registers `CqrsModule.forRoot()`), `mock` the R1-04 mock. The ledger is core
 *   `CostLedgerService`, the provider mode core `ProviderModeService` (R1-11), and the stage
 *   executors are the R1-14 executors (`src/stages/**`), which read the catalog through that
 *   root's QueryBus. The learning notes of the `brief` step (SPEC 0003 R2-07) come from core
 *   `LearningNotesReader` through `LearningsReadModule`, the read side only.
 */
export type AgentsSelection = 'mock' | 'core';

export type PortSelection = { kind: 'mock'; fault: MockFaultPlan } | { kind: 'catalog'; fault: MockFaultPlan; agents: AgentsSelection };

function assetResolverBinding(selection: PortSelection): Provider {
  return selection.kind === 'catalog' ? catalogAssetResolverProvider : mockAssetResolverProvider;
}

function providerModeBinding(selection: PortSelection): Provider {
  return selection.kind === 'catalog' ? { provide: PROVIDER_MODE, useExisting: ProviderModeService } : mockProviderModeProvider;
}

function costLedgerBinding(selection: PortSelection): Provider {
  return selection.kind === 'catalog' ? { provide: COST_LEDGER, useExisting: CostLedgerService } : mockCostLedgerProvider;
}

function stageExecutorBindings(selection: PortSelection): Provider[] {
  return selection.kind === 'catalog' ? stageExecutorProviders : [mockStageExecutorsProvider];
}

function usesCoreAgents(selection: PortSelection): boolean {
  return selection.kind === 'catalog' && selection.agents === 'core';
}

function learningNotesBinding(selection: PortSelection): Provider {
  return selection.kind === 'catalog' ? { provide: LEARNING_NOTES, useExisting: LearningNotesReader } : mockLearningNotesProvider;
}

function agentsBinding(selection: PortSelection): Provider {
  return usesCoreAgents(selection) ? { provide: AGENTS, useExisting: AgentsService } : mockAgentsProvider;
}

/**
 * Read side only: the watcher never writes the catalog (ADR 0003). `AgentsModule` imports the same
 * `CatalogReadModule` and `CostsReadModule`, never `CatalogModule` or `CostsModule`, so no command
 * handler is registered and each catalog query has exactly one handler. `ProvidersModule` and
 * `CostsReadModule` back the R1-11 provider mode and ledger the engine and the executors share.
 * `LearningsReadModule` registers the learnings query side only (no save or retire handler), so the
 * watcher reads learning notes and writes none (ADR 0003, SPEC 0003 R2-07).
 */
function portImports(selection: PortSelection): NonNullable<ModuleMetadata['imports']> {
  if (selection.kind === 'mock') return [];
  const readSide = [CatalogReadModule, ProvidersModule, CostsReadModule, LearningsReadModule];
  return usesCoreAgents(selection) ? [...readSide, AgentsModule.register({ toolSet: readOnlyAgentToolSet })] : readSide;
}

/**
 * Binds every engine port token. One provider per line: R1-06 selects the asset resolver here
 * (SQLite adapter or mock), R1-11 the ledger and provider mode, R1-12 the agents, R1-14 the stage
 * executors, each without touching the engine.
 */
@Module({})
export class WatcherPortsModule {
  static register(selection: PortSelection): DynamicModule {
    return {
      module: WatcherPortsModule,
      imports: portImports(selection),
      providers: [
        { provide: CLOCK, useClass: SystemClock },
        { provide: WATCHER_PROCESS, useValue: { pid: process.pid } satisfies WatcherProcess },
        mockFaultPlanProvider(selection.fault),
        providerModeBinding(selection),
        assetResolverBinding(selection),
        costLedgerBinding(selection),
        agentsBinding(selection),
        learningNotesBinding(selection),
        ...stageExecutorBindings(selection),
      ],
      exports: [...enginePortTokens],
    };
  }
}
