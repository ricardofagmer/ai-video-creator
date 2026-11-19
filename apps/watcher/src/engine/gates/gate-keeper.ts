import { Inject, Injectable } from '@nestjs/common';
import { readApprovalFile } from '@studio/shared/run-files';
import { latestDecision, type GateId, type RunFile, type RunStatus } from '@studio/shared/run-format';
import { type ActiveRun } from '../active-run';
import { type Clock } from '../clock';
import { CLOCK } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';

interface HumanGate {
  gate: GateId;
  label: string;
  whatToDo: string;
}

export type GateVerdict = { kind: 'open' } | { kind: 'held'; status: RunStatus };

/**
 * Gates that follow a stage: the plan gate after `plan` (topology section 12, K2) and every gate
 * the recipe adds after that stage. `final` is the review gate, answered after `review`.
 */
function gatesAfter(run: Readonly<RunFile>, stageId: string): HumanGate[] {
  const planGate: HumanGate[] =
    stageId === 'plan'
      ? [{ gate: 'plan', label: ownerTexts.planGateLabel, whatToDo: ownerTexts.gateWhatToDo(ownerTexts.planGateLabel) }]
      : [];
  const recipeGates = run.recipe.definition.gates
    .filter((gate) => gate.afterStage === stageId)
    .map((gate): HumanGate => ({ gate: gate.id, label: gate.label, whatToDo: gate.whatToDo }));
  return [...planGate, ...recipeGates];
}

/**
 * Human gates as run states answered through files (SPEC 0002 A6, K2): before a stage starts, the
 * gates after the previous delivered stage must be approved in `approval.json`, which only the
 * api or CLI writes. Unanswered gives `waiting`; rejected ends the run `rejected`.
 */
@Injectable()
export class GateKeeper {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async beforeStage(active: ActiveRun, stageNumber: number): Promise<GateVerdict> {
    const run = active.snapshot;
    const previous = run.stages
      .filter((stage) => stage.number < stageNumber && stage.outcome.status === 'delivered')
      .at(-1);
    if (previous === undefined) return { kind: 'open' };
    const gates = gatesAfter(run, previous.stageId);
    if (gates.length === 0) return { kind: 'open' };

    const approval = await readApprovalFile(active.runDir);
    for (const gate of gates) {
      const decision =
        approval.status === 'present' && approval.value.runId === run.runId ? latestDecision(approval.value, gate.gate) : undefined;
      if (decision === undefined) return this.wait(active, gate);
      await active.emit({
        type: 'gate.answered',
        level: decision.outcome === 'approved' ? 'ok' : 'warning',
        text: ownerTexts.gateAnswered(gate.gate, decision.outcome),
        stepKey: null,
        gate: gate.gate,
        outcome: decision.outcome,
      });
      if (decision.outcome === 'rejected') {
        // Watcher-written `running` -> `rejected` is sanctioned by ADR 0003 (writer table, amended by SPEC 0002 rev 3).
        await active.setState({ status: 'rejected', since: this.clock.now().toISOString(), decidedBy: decision.decidedBy, gate: gate.gate });
        return { kind: 'held', status: 'rejected' };
      }
    }
    return { kind: 'open' };
  }

  private async wait(active: ActiveRun, gate: HumanGate): Promise<GateVerdict> {
    await active.emit({ type: 'gate.waiting', level: 'info', text: ownerTexts.gateWaitingReason(gate.label), stepKey: null, gate: gate.gate });
    await active.setState({
      status: 'waiting',
      since: this.clock.now().toISOString(),
      cause: { kind: 'gate', gate: gate.gate },
      reason: ownerTexts.gateWaitingReason(gate.label),
      whatToDo: gate.whatToDo,
    });
    return { kind: 'held', status: 'waiting' };
  }
}
