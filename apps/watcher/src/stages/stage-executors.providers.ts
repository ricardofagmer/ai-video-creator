import { type Provider } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ProviderModeService } from '@studio/core/providers';
import type { AgentsPort } from '@studio/shared/agents';
import type { AssetResolverPort, CostLedgerPort, StageExecutorPort } from '@studio/shared/ports';
import { RunManifestBuilder } from '../adapters/manifest/run-manifest.builder';
import { type Clock } from '../engine/clock';
import { AGENTS, ASSET_RESOLVER, CLOCK, COST_LEDGER, STAGE_EXECUTORS } from '../engine/engine.tokens';
import { ToolRunner } from './process/tool-runner.client';
import { CatalogLookup } from './shared/catalog-lookup';
import { STAGE_SETTINGS, readStageSettings, type StageSettings } from './shared/stage-settings';
import { createStageExecutors } from './stage-executors.factory';

/**
 * Composition-root providers of the R1-14 executors (catalog selection only; the dev fixture keeps
 * the mocks). The environment is read here once and validated by name; services receive the parsed
 * settings, never `process.env`.
 */
export const stageExecutorProviders: Provider[] = [
  { provide: STAGE_SETTINGS, useFactory: (): StageSettings => readStageSettings(process.env) },
  RunManifestBuilder,
  {
    provide: STAGE_EXECUTORS,
    useFactory: (
      agents: AgentsPort,
      ledger: CostLedgerPort,
      providerModes: ProviderModeService,
      clock: Clock,
      queries: QueryBus,
      assetResolver: AssetResolverPort,
      manifestBuilder: RunManifestBuilder,
      settings: StageSettings,
    ): readonly StageExecutorPort[] =>
      createStageExecutors({
        agents,
        ledger,
        providerModes,
        clock,
        settings,
        runner: new ToolRunner(settings),
        catalog: new CatalogLookup(queries),
        assetResolver,
        manifestBuilder,
      }),
    inject: [AGENTS, COST_LEDGER, ProviderModeService, CLOCK, QueryBus, ASSET_RESOLVER, RunManifestBuilder, STAGE_SETTINGS],
  },
];
