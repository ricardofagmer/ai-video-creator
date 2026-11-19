import { type Provider } from '@nestjs/common';
import type { AgentsPort } from '@studio/shared/agents';
import type { ProviderModePort, StageExecutorPort } from '@studio/shared/ports';
import { type Clock } from '../engine/clock';
import { AGENTS, ASSET_RESOLVER, CLOCK, COST_LEDGER, LEARNING_NOTES, PROVIDER_MODE, STAGE_EXECUTORS } from '../engine/engine.tokens';
import { createMockStageExecutors } from './executors/mock-executors.factory';
import { MockAgentsService } from './mock-agents.service';
import { MockAssetResolver } from './mock-asset-resolver';
import { MockCostLedger } from './mock-cost-ledger';
import { MOCK_FAULT_PLAN, type MockFaultPlan } from './mock-fault';
import { MockLearningNotes } from './mock-learning-notes';
import { MockProviderMode } from './mock-provider-mode';

/**
 * Mock bindings, one provider per port, listed one per line in `src/watcher-ports.module.ts` so a
 * later ticket replaces its line there instead of editing this file: R1-06 swaps
 * `mockAssetResolverProvider`, R1-11 the ledger and provider mode, R1-12 the agents, R1-14 the
 * stage executors.
 */

export function mockFaultPlanProvider(plan: MockFaultPlan): Provider {
  return { provide: MOCK_FAULT_PLAN, useValue: plan };
}

export const mockProviderModeProvider: Provider = {
  provide: PROVIDER_MODE,
  useFactory: (plan: MockFaultPlan): ProviderModePort => new MockProviderMode(plan),
  inject: [MOCK_FAULT_PLAN],
};

export const mockAssetResolverProvider: Provider = { provide: ASSET_RESOLVER, useClass: MockAssetResolver };

export const mockCostLedgerProvider: Provider = {
  provide: COST_LEDGER,
  useFactory: (clock: Clock): MockCostLedger => new MockCostLedger(clock),
  inject: [CLOCK],
};

export const mockAgentsProvider: Provider = { provide: AGENTS, useClass: MockAgentsService };

/** SPEC 0003 R2-07: the fixture catalog has no learning notes. */
export const mockLearningNotesProvider: Provider = { provide: LEARNING_NOTES, useClass: MockLearningNotes };

/** The mock executors use the mock ledger's `ensureCostFile`, so they need the mock binding. */
export const mockStageExecutorsProvider: Provider = {
  provide: STAGE_EXECUTORS,
  useFactory: (
    agents: AgentsPort,
    ledger: MockCostLedger,
    clock: Clock,
    providerMode: ProviderModePort,
    faultPlan: MockFaultPlan,
  ): StageExecutorPort[] => createMockStageExecutors({ tools: { agents, ledger, clock }, providerMode, faultPlan }),
  inject: [AGENTS, COST_LEDGER, CLOCK, PROVIDER_MODE, MOCK_FAULT_PLAN],
};
