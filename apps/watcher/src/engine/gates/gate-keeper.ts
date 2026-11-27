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
}

export type GateVerdict = { kind: 'open' } | { kind: 'held'; status: RunStatus };

/**
 * Gates that follow a stage: the plan gate after `plan` (topology section 12, K2) and every gate
 * the recipe adds after that stage. `final` is the review gate, answered after `review`.
 */
function gatesAfter(run: Readonly<RunFile>, stageId: string): HumanGate[] {
  const planGate: HumanGate[] =
    stageId === 'plan'
      ? [{ gate: 'plan', label: ownerTexts.planGateLabel }]
      : [];
  const recipeGates = run.recipe.definition.gates
    .filter((gate) => gate.afterStage === stageId)
    .map((gate): HumanGate => ({ gate: gate.id, label: gate.label }));
  return [...planGate, ...recipeGates];
}

/**
 * Human gates answered through files (SPEC 0002 A6, K2): before a stage starts, the gates after the
 * previous delivered stage are read from `approval.json`, which only the api or CLI writes. A
 * rejected gate ends the run `rejected`. An unanswered gate no longer holds the run (owner decision
 * 2026-11-25): a warning names it and the stage starts.
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
      if (decision === undefined) {
        await active.emit({ type: 'log', level: 'warning', text: ownerTexts.gateSkipped(gate.label), stepKey: null });
        continue;
      }
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
}
