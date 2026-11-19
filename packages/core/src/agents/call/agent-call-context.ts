import { Injectable } from '@nestjs/common';
import { RECOVER_STEP_TASK, type AgentPacket, type ModelRoleName } from '@studio/shared/agents';
import { type AssetRef } from '@studio/shared/catalog';
import { type Binding } from '@studio/shared/recipes';
import { readRunFile, runDirectory } from '@studio/shared/run-files';
import { formatStepKey, type ModelId, type StepKey } from '@studio/shared/run-format';
import { DataHome } from '../../paths';
import { AgentModelSelector } from './agent-model-selector';

/**
 * Facts of one call that the frozen C7 packet does not carry, read from the run folder the
 * engine owns. `AgentsPort.run(role, packet, options?)` stays the only entry point.
 */
export interface AgentCallContext {
  readonly runDir: string;
  readonly stepKey: StepKey;
  readonly modelId: ModelId;
  readonly bindings: readonly Binding[];
  /** Catalog prompt and skill versions the role used, for prompt-version metering (topology 10). */
  readonly promptRefs: readonly AssetRef[];
  readonly skillRefs: readonly AssetRef[];
}

/** Agent steps run inside the engine's `execute` step; Recovery runs for the failed step. */
const AGENT_STEP = 'execute';

function stepKeyOf(packet: AgentPacket<ModelRoleName>): StepKey {
  if (packet.task === RECOVER_STEP_TASK) return formatStepKey(packet.inputs.failedStep);
  return formatStepKey({ stageId: packet.stageId, step: AGENT_STEP, attempt: packet.attempt });
}

function refsForSlot(bindings: readonly Binding[], slot: string): AssetRef[] {
  return bindings.filter((binding) => binding.slot === slot).map((binding) => binding.ref);
}

@Injectable()
export class AgentCallContextResolver {
  constructor(
    private readonly dataHome: DataHome,
    private readonly models: AgentModelSelector,
  ) {}

  /** Reads run.json (C5, read-only) for the pinned recipe's bindings; the watcher wrote it. */
  async resolve(role: ModelRoleName, packet: AgentPacket<ModelRoleName>): Promise<AgentCallContext> {
    const runDir = runDirectory(this.dataHome.runs, packet.runId);
    const run = await readRunFile(runDir);
    const bindings = run.recipe.definition.bindings;
    return {
      runDir,
      stepKey: stepKeyOf(packet),
      modelId: await this.models.select(role, bindings),
      bindings,
      promptRefs: refsForSlot(bindings, `prompt:${role}`),
      skillRefs: refsForSlot(bindings, `skill:${role}`),
    };
  }
}
