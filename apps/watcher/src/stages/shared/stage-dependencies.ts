import type { AgentsPort } from '@studio/shared/agents';
import type { AssetResolverPort, CostLedgerPort, ProviderModePort } from '@studio/shared/ports';
import { type ProviderName } from '@studio/shared/run-format';
import { type Secret } from '@studio/core/secrets';
import { type RunManifestBuilder } from '../../adapters/manifest/run-manifest.builder';
import { type Clock } from '../../engine/clock';
import { type HyperframesStagePorts } from '../composition/hyperframes-stage.ports';
import { type ToolRunner } from '../process/tool-runner.client';
import { type CatalogLookup } from './catalog-lookup';
import { type StageSettings } from './stage-settings';

/**
 * The R1-11 provider mode as the stages use it: one source for the engine, the agents and the
 * live adapters. `credentialFor` returns a `Secret`; only `revealForProviderCall` reads its value.
 */
export interface LiveProviderModes extends ProviderModePort {
  isLive(provider: ProviderName): boolean;
  credentialFor(provider: ProviderName): Secret;
}

/** Everything a stage executor uses besides its C6 execution context. */
export interface StageDependencies {
  agents: AgentsPort;
  ledger: CostLedgerPort;
  providerModes: LiveProviderModes;
  clock: Clock;
  settings: StageSettings;
  runner: ToolRunner;
  catalog: CatalogLookup;
  assetResolver: AssetResolverPort;
  manifestBuilder: RunManifestBuilder;
  /** SPEC 0008: the gate files, the pinned runtime and the template folder reader. */
  hyperframes: HyperframesStagePorts;
}
