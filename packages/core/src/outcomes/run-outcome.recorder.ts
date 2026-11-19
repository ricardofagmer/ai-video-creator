import { Injectable, Logger } from '@nestjs/common';
import { type RunFile } from '@studio/shared/run-format';
import { toRunIndexData } from '../runs/run-index.mapper';
import { readRunEvidence } from './run-evidence';
import { toRunOutcomeRow, type FinalGateDecision } from './run-outcome.mapper';
import { RunOutcomeRepository, type RecordedOutcome } from './run-outcome.repository';

export interface RecordOutcomeInput {
  runDir: string;
  /** run.json as written with the decision: status `approved` or `rejected`. */
  run: RunFile;
  /** The final decision in force in approval.json. */
  decision: FinalGateDecision;
}

/**
 * Writes the reviewed run's outcome to SQLite (ADR 0003: "the same outcome is written to SQLite"):
 * the run index row with the decided status, one `run_outcomes` row, and the asset versions used
 * with their `usageCount` incremented once per run. Repeating it for the same run changes nothing.
 */
@Injectable()
export class RunOutcomeRecorder {
  private readonly logger = new Logger(RunOutcomeRecorder.name);

  constructor(private readonly outcomes: RunOutcomeRepository) {}

  async record(input: RecordOutcomeInput): Promise<RecordedOutcome> {
    const { run, decision } = input;
    const evidence = await readRunEvidence(input.runDir, run);
    const recorded = await this.outcomes.record({
      index: toRunIndexData(run, new Date()),
      row: toRunOutcomeRow(run, decision, evidence),
      assets: evidence.assets,
    });
    // Ids, counts and the decision only: reviewer name and notes are personal text (PRD 12).
    this.logger.log({
      event: 'outcomes.recorded',
      runId: run.runId,
      decision: decision.outcome,
      rating: decision.rating,
      outcome: recorded.outcome,
      assetVersionsUsed: evidence.assets.length,
      assetVersionsCounted: recorded.assetVersionsCounted,
      qaMetrics: evidence.qaMetrics.status,
      correlationId: decision.correlationId,
    });
    return recorded;
  }
}
