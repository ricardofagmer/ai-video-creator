import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type ModelRoleName } from '@studio/shared/agents';
import { type AssetVersion } from '@studio/shared/catalog';
import { type Binding } from '@studio/shared/recipes';
import { ModelIdSchema, type ModelId } from '@studio/shared/run-format';
import { GetAssetVersionQuery } from '../../catalog';
import { agentRoster } from '../agent-roster';
import { AgentRunError } from '../agents.errors';

/** Binding slot of the per-recipe model override (C2 well-known slots). */
export function modelSlotOf(role: ModelRoleName): string {
  return `model:${role}`;
}

/**
 * Model of one role for one run: the recipe's `model:<role>` binding when present (an
 * `ai-model` provider-model version for Anthropic with a literal model id), else the ADR 0002
 * default. Exported so the stage executors (R1-14) can report the models a stage used. A binding
 * that is not such a version, or whose content hash differs from the pin, fails closed; it never
 * silently means the default.
 */
@Injectable()
export class AgentModelSelector {
  constructor(private readonly queries: QueryBus) {}

  async select(role: ModelRoleName, bindings: readonly Binding[]): Promise<ModelId> {
    const binding = bindings.find((candidate) => candidate.slot === modelSlotOf(role));
    if (binding === undefined) return agentRoster[role].defaultModelId;

    const invalid = new AgentRunError(role, { kind: 'configuration', reason: 'model-binding' });
    const version = await this.readVersion(binding.ref, invalid);
    if (version.contentHash !== binding.contentHash) throw invalid;
    if (version.kind !== 'ai-model') throw invalid;
    const { provider, modelType, modelIdRef } = version.details;
    if (provider !== 'anthropic' || modelType !== 'provider-model' || modelIdRef.type !== 'literal') throw invalid;
    const modelId = ModelIdSchema.safeParse(modelIdRef.value);
    if (!modelId.success) throw invalid;
    return modelId.data;
  }

  private async readVersion(ref: string, invalid: AgentRunError): Promise<AssetVersion> {
    try {
      return await this.queries.execute(new GetAssetVersionQuery(ref));
    } catch {
      // A catalog error message can name paths; the binding problem is reported by kind only.
      throw invalid;
    }
  }
}
