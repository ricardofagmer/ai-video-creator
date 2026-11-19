import { Module, type DynamicModule, type ModuleMetadata, type Provider, type Type } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CatalogReadModule } from '../catalog';
import { CostsReadModule } from '../costs';
import { PathsModule } from '../paths';
import { ProvidersModule } from '../providers';
import { RedactionModule } from '../redaction';
import { LiveClaudeAdapter } from './adapters/live-claude.adapter';
import { MastraAgentFactory } from './adapters/mastra-agent.factory';
import { MockClaudeAdapter } from './adapters/mock-claude.adapter';
import { AgentsService } from './agents.service';
import { AgentCallContextResolver } from './call/agent-call-context';
import { AgentModelSelector } from './call/agent-model-selector';
import { OutputScanner } from './safety/output-scanner';
import { AGENT_TOOL_SET_PROVIDER, AgentToolSetResolver, NoAgentToolSetProvider, type AgentToolSetProvider } from './tooling/agent-tool-set';

export interface AgentsModuleOptions {
  /**
   * R1-13 tool provider for the role allowlists, with the modules it needs. Absent: no tools, so
   * mock calls still run and live calls of roles that have tools fail `tools-unavailable`.
   */
  readonly toolSet?: {
    readonly imports?: ModuleMetadata['imports'];
    readonly useClass: Type<AgentToolSetProvider>;
  };
}

/**
 * The five agents of topology v1 (R1-12) as NestJS providers on Mastra. Exports `AgentsService`
 * only; the engine binds it as C7 `AgentsPort`. No Mastra instance, storage, memory, workflow or
 * HTTP route is created: each call builds a standalone Mastra `Agent`. The composition root
 * registers `CqrsModule.forRoot()` (catalog queries resolve the bound model versions). It imports
 * only the read-only catalog and cost modules, so the watcher can host it (ADR 0003).
 */
@Module({})
export class AgentsModule {
  static register(options: AgentsModuleOptions = {}): DynamicModule {
    const toolSetProvider: Provider = {
      provide: AGENT_TOOL_SET_PROVIDER,
      useClass: options.toolSet?.useClass ?? NoAgentToolSetProvider,
    };
    return {
      module: AgentsModule,
      imports: [CqrsModule, CatalogReadModule, PathsModule, ProvidersModule, CostsReadModule, RedactionModule, ...(options.toolSet?.imports ?? [])],
      providers: [
        toolSetProvider,
        AgentToolSetResolver,
        AgentModelSelector,
        AgentCallContextResolver,
        OutputScanner,
        MockClaudeAdapter,
        MastraAgentFactory,
        LiveClaudeAdapter,
        AgentsService,
      ],
      exports: [AgentsService],
    };
  }
}
