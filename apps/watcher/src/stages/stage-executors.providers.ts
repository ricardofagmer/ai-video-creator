import { type Provider } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { FolderReader } from '@studio/core/asset-store';
import { DataHome } from '@studio/core/paths';
import { ProviderModeService, providerSettingsEnvironment } from '@studio/core/providers';
import { RUNTIME_DIR_ENV_VAR, nodeRuntimeFileSystem, resolveStudioRuntime, type StudioRuntime } from '@studio/core/runtime';
import type { AgentsPort } from '@studio/shared/agents';
import type { AssetResolverPort, CostLedgerPort, ReferenceAnalysisReaderPort, StageExecutorPort } from '@studio/shared/ports';
import { RunManifestBuilder } from '../adapters/manifest/run-manifest.builder';
import { REFERENCE_ANALYSIS_READER } from '../asset-jobs/asset-jobs.tokens';
import { type Clock } from '../engine/clock';
import { AGENTS, ASSET_RESOLVER, CLOCK, COST_LEDGER, STAGE_EXECUTORS } from '../engine/engine.tokens';
import { realHyperframesStagePorts } from './composition/hyperframes-stage.ports';
import { ToolRunner } from './process/tool-runner.client';
import { CatalogLookup } from './shared/catalog-lookup';
import { STAGE_SETTINGS, readStageSettings, type StageSettings } from './shared/stage-settings';
import { createStageExecutors } from './stage-executors.factory';

/** Plan C3 rev 2: deterministic from the environment, so both factories below read the same runtime. */
function processStudioRuntime(): StudioRuntime {
  return resolveStudioRuntime({ override: process.env[RUNTIME_DIR_ENV_VAR], fileSystem: nodeRuntimeFileSystem });
}

/**
 * Composition-root providers of the R1-14 executors (catalog selection only; the dev fixture keeps
 * the mocks). The environment is read here once and validated by name; services receive the parsed
 * settings, never `process.env`.
 */
export const stageExecutorProviders: Provider[] = [
  {
    provide: STAGE_SETTINGS,
    inject: [DataHome],
    // Over `<data home>/providers.json`: the installed watcher starts from launchd with no shell
    // variables, so the local voice program can only be named there.
    useFactory: (dataHome: DataHome): StageSettings => readStageSettings(providerSettingsEnvironment(dataHome, process.env), processStudioRuntime()),
  },
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
      dataHome: DataHome,
      folders: FolderReader,
      referenceAnalyses: ReferenceAnalysisReaderPort,
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
        hyperframes: realHyperframesStagePorts(dataHome, folders, processStudioRuntime()),
        referenceAnalyses,
      }),
    inject: [AGENTS, COST_LEDGER, ProviderModeService, CLOCK, QueryBus, ASSET_RESOLVER, RunManifestBuilder, STAGE_SETTINGS, DataHome, FolderReader, REFERENCE_ANALYSIS_READER],
  },
];
