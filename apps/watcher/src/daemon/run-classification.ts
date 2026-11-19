import { type OptionalFile, type WatcherState } from '@studio/shared/run-files';
import { latestDecision, resumableStatuses, type ApprovalFile, type GateId, type RunFile, type RunId } from '@studio/shared/run-format';

/**
 * Why the daemon starts a run. `crash-resume`: recorded `running` with no live watcher (criterion
 * 13). `owner-resume`: a held run with `resume` in control.json (A6). `approval-answered`: a run
 * waiting on a gate or on planner questions whose answer is now in approval.json. `pending`: a new run.
 */
export type RunTrigger = 'crash-resume' | 'owner-resume' | 'approval-answered' | 'pending';

/** The run files the decision reads; the scanner loads only what the run's status needs. */
export interface RunFacts {
  run: Pick<Readonly<RunFile>, 'runId' | 'state'>;
  owner: WatcherState;
  resumeRequested: boolean;
  approval: OptionalFile<ApprovalFile>;
}

export type RunVerdict =
  | { kind: 'start'; trigger: RunTrigger }
  /** ADR 0003 single writer: another live watcher owns the run, so this daemon refuses it. */
  | { kind: 'owned'; ownerPid: number }
  | { kind: 'idle' };

/** Lower first: unfinished work before owner requests before new runs (A8 queue order). */
export const triggerPriority: Readonly<Record<RunTrigger, number>> = {
  'crash-resume': 0,
  'owner-resume': 1,
  'approval-answered': 2,
  pending: 3,
};

/** The gate a waiting run is held on: its own gate, or `plan` for planner questions (topology section 12). */
function awaitedGate(state: RunFile['state']): GateId | null {
  if (state.status !== 'waiting') return null;
  if (state.cause.kind === 'gate') return state.cause.gate;
  if (state.cause.kind === 'planner-questions') return 'plan';
  return null;
}

/**
 * A decision written after the run started waiting. Without this check the daemon would re-execute
 * a run held on an unanswered gate on every scan, and each execution would only hold it again.
 */
function answeredSinceWaiting(facts: RunFacts, gate: GateId): boolean {
  if (facts.approval.status === 'absent' || facts.approval.value.runId !== facts.run.runId) return false;
  const decision = latestDecision(facts.approval.value, gate);
  return decision !== undefined && Date.parse(decision.decidedAt) >= Date.parse(facts.run.state.since);
}

function triggerOf(facts: RunFacts): RunTrigger | null {
  const status = facts.run.state.status;
  if (status === 'pending') return 'pending';
  if (status === 'running') return 'crash-resume';
  if (!resumableStatuses.includes(status)) return null;
  if (facts.resumeRequested) return 'owner-resume';
  const gate = awaitedGate(facts.run.state);
  return gate !== null && answeredSinceWaiting(facts, gate) ? 'approval-answered' : null;
}

/**
 * Whether this daemon may start the run now. The ownership rule is the one `RunEngine.execute`
 * enforces (RUN-FORMAT 14): a live pid in `watcher.pid` owns the run, and a live owner with
 * `running` recorded is executing it even when that pid is this process. Checking it here keeps
 * the daemon from claiming a run it would only be refused.
 */
export function classifyRun(facts: RunFacts, selfPid: number): RunVerdict {
  const trigger = triggerOf(facts);
  if (trigger === null) return { kind: 'idle' };
  const { owner } = facts;
  if (owner.status === 'alive' && (owner.pid !== selfPid || facts.run.state.status === 'running')) {
    return { kind: 'owned', ownerPid: owner.pid };
  }
  return { kind: 'start', trigger };
}

export interface RunCandidate {
  runId: RunId;
  runDir: string;
  trigger: RunTrigger;
}

export function compareCandidates(left: RunCandidate, right: RunCandidate): number {
  const byTrigger = triggerPriority[left.trigger] - triggerPriority[right.trigger];
  if (byTrigger !== 0) return byTrigger;
  // Run ids are ULIDs, so the string order is creation order: the oldest queued run goes first.
  return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
}
