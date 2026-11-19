import { Module, type DynamicModule, type ModuleMetadata, type Type } from '@nestjs/common';
import { type CurationCostPort } from '@studio/shared/ports';
import { ProvidersModule } from '../../providers';
import { RedactionModule } from '../../redaction';
import { MastraAgentFactory } from '../adapters/mastra-agent.factory';
import { CuratorAgentService } from './curator-agent.service';
import { CuratorModelClient } from './curator-model.client';
import { CURATION_COST_PORT, CURATOR_PRICING, type CuratorPricing } from './curator.tokens';

export interface CuratorAgentModuleOptions {
  /** Modules that provide and export the two classes below (the watcher's cost modules). */
  readonly imports?: ModuleMetadata['imports'];
  /** The C6 `CurationCostPort` implementation (C5-02 `CurationCostLedger`), bound with `useExisting`. */
  readonly curationCost: Type<CurationCostPort>;
  /** The versioned price table (`CostLedgerService` in the watcher), bound with `useExisting`. */
  readonly pricing: Type<CuratorPricing>;
}

/**
 * The Curator of topology 0004 as a NestJS provider on Mastra (SPEC 0005 section 5.5). Exports
 * `CuratorAgentService`, which the watcher binds as C6 `CuratorPort`. Hosted by the watcher only
 * (K1): no Mastra instance, storage, memory, workflow or HTTP route is created (K2), and each call
 * builds a standalone, tool-less Mastra `Agent`. Cost and pricing arrive through ports, so this
 * module imports nothing from `costs/` or `curation/`.
 */
@Module({})
export class CuratorAgentModule {
  static register(options: CuratorAgentModuleOptions): DynamicModule {
    return {
      module: CuratorAgentModule,
      imports: [ProvidersModule, RedactionModule, ...(options.imports ?? [])],
      providers: [
        { provide: CURATION_COST_PORT, useExisting: options.curationCost },
        { provide: CURATOR_PRICING, useExisting: options.pricing },
        MastraAgentFactory,
        CuratorModelClient,
        CuratorAgentService,
      ],
      exports: [CuratorAgentService],
    };
  }
}
