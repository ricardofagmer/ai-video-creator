import type { ReferenceAnalysisEntry, ReferenceStyleAnalysis } from '../agents/reference-analysis';
import type { AssetJobKind } from '../asset-jobs/asset-job';
import type { AssetRef } from '../catalog/asset-kind';
import type { SessionId } from '../common/ids';
import type { UsageQuantity } from './cost-ledger';

/**
 * Asset job ports (docs/specs/2026-11-23-guided-creation-design.md). Asset jobs run in the watcher
 * outside any run, so they do not use the run-bound `AgentsPort` or `CostLedgerPort.record`.
 */

/**
 * Reads the kept analyses a run may use. Only `done` analyses are returned, in the order of
 * `refs`, at most `REFERENCE_ANALYSES_MAX`; a missing, open, failed or unreadable job is skipped,
 * never an error, so an analysis can never stop a stage that only uses it as guidance.
 */
export interface ReferenceAnalysisReaderPort {
  readDone(refs: readonly AssetRef[]): Promise<ReferenceAnalysisEntry[]>;
}

export interface ReferenceAnalystRequest {
  ref: AssetRef;
  /** The catalog item's name, as data for the model. */
  name: string;
  /** The owner's `referenceNotes`, as data for the model; may be empty. */
  ownerNotes: string;
  /** JPEG frames in video order, already bounded by `referenceAnalysisBounds`. */
  frames: readonly Uint8Array[];
  durationMs: number;
  signal: AbortSignal;
}

/** One analyst call's result; `usd` is what the call billed (0 in mock mode). */
export type ReferenceAnalystResult =
  | { status: 'ok'; mode: 'live' | 'mock'; analysis: ReferenceStyleAnalysis; sessionId: SessionId; usage: UsageQuantity | null; usd: number }
  | {
      status: 'failed';
      reason: 'timed-out' | 'provider-error' | 'rate-limited' | 'credential-refused' | 'output-invalid';
      sessionId: SessionId;
      usage: UsageQuantity | null;
      usd: number;
    };

/** The reference analyst: exactly one model call per `analyse`, no tools, frames as image parts. */
export interface ReferenceAnalystPort {
  /** True when the model provider is live; false means `analyse` answers with the labelled stand-in. */
  isLive(): boolean;
  analyse(request: ReferenceAnalystRequest): Promise<ReferenceAnalystResult>;
}

export interface AssetJobCostRecordRequest {
  ref: AssetRef;
  kind: AssetJobKind;
  sessionId: SessionId;
  usage: UsageQuantity;
  usd: number;
  occurredAt: Date;
}

/**
 * Asset job cost accounting (spec Amendment 3), bound by the watcher; it mirrors the curation cost
 * path. `record` appends one session to `asset-jobs/<kind>/<ref>/cost.json` (`AssetJobCostFileSchema`)
 * and never writes SQLite (ADR 0003): writes are serialised per job, idempotent on `sessionId`
 * (same values: no-op; other values: conflict error), `usd` must equal the price table's price of
 * `usage`, only `model` and `tts` usage is accepted, and a file holding
 * `ASSET_JOB_COST_SESSIONS_MAX` sessions refuses the next one (fails closed). The file survives
 * re-requests of the job and the removal of its sample clips. The api and the CLI index the file
 * into `cost_entries` with `IndexAssetJobCostCommand`: `source_kind = 'asset-job'`, `run_id` holds
 * the ref, `step_key` holds `asset-job:<kind>`, `call_index` is 1. `monthToDateUsd` counts indexed
 * rows plus cost.json sessions not indexed yet, deduplicated by key, and throws when any spend
 * cannot be read; the caller then refuses the job (fails closed).
 */
export interface AssetJobCostPort {
  priceUsd(usage: UsageQuantity): number;
  record(request: AssetJobCostRecordRequest): Promise<void>;
  monthToDateUsd(at: Date): Promise<number>;
  /** The owner's month ceiling in USD. */
  monthCeilingUsd(): Promise<number>;
}
