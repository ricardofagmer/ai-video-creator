import { RecordGateDecisionCommand, ReviewNotAllowedError } from '@studio/core/review';
import { type GateDecision, type GateId, type RunId, type RunState } from '@studio/shared/run-format';
import { ExitCode } from '../errors/exit-codes.js';
import { withCliContext } from '../nest/cli-context.js';
import { readRunSnapshot } from '../runs/run-reader.js';
import { type CommandDependencies } from './command-dependencies.js';

/** Who a CLI gate answer is recorded as; the CLI has no web session (same actor as runs and platform gates). */
const CLI_ACTOR = 'cli';

export type GateOutcome = GateDecision['outcome'];

export interface RunGateOptions {
  runId: RunId;
  outcome: GateOutcome;
  /** Optional on approve; the program requires it on reject, as the web does. */
  notes: string;
}

type InRunDecision = Exclude<GateDecision, { kind: 'final' }>;

/** The gate a waiting run is held on; planner questions are answered on the plan gate (topology section 12). */
function awaitedGate(state: RunState): GateId | null {
  if (state.status !== 'waiting') return null;
  if (state.cause.kind === 'gate') return state.cause.gate;
  if (state.cause.kind === 'planner-questions') return 'plan';
  return null;
}

function decisionFor(gate: GateId, options: RunGateOptions, decidedAt: Date): InRunDecision {
  const authority = { outcome: options.outcome, notes: options.notes, decidedBy: CLI_ACTOR, decidedAt: decidedAt.toISOString(), correlationId: null };
  return gate === 'plan' ? { kind: 'plan', ...authority } : { kind: 'recipe-gate', gate, ...authority };
}

function confirmation(gate: GateId, options: RunGateOptions): string {
  if (gate === 'plan') {
    return options.outcome === 'approved'
      ? `Plano aprovado (${options.runId}). O watcher continua a execução.`
      : `Plano recusado (${options.runId}). O watcher encerra a execução.`;
  }
  const answer = options.outcome === 'approved' ? 'Aprovação' : 'Recusa';
  return `${answer} da etapa ${gate} registrada (${options.runId}). O watcher lê a resposta e segue.`;
}

/**
 * `studio approve|reject <runId>`: answers the gate the run waits on (SPEC 0002 A6, K2) through core
 * `RecordGateDecisionCommand`, the handler behind the api's gate-decisions route, so an answer from
 * here shows in the web. The final review stays in the web.
 */
export async function runGateCommand(options: RunGateOptions, dependencies: CommandDependencies): Promise<number> {
  const snapshot = await readRunSnapshot(dependencies.settings.dataHome.runs, options.runId);
  const gate = awaitedGate(snapshot.run.state);
  if (gate === null) throw new ReviewNotAllowedError(options.runId, snapshot.displayedStatus, 'gate-not-awaited');
  const decision = decisionFor(gate, options, new Date());
  await withCliContext((context) => context.commandBus.execute(new RecordGateDecisionCommand({ runId: options.runId, decision })));
  dependencies.printer.line(confirmation(gate, options));
  return ExitCode.ok;
}
