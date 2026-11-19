import type { CurationId, SessionId } from '../common/ids';
import type { CurationCostSession } from '../curation/cost';
import type { CuratorCorrection, CuratorOutput, CuratorTaskPacket } from '../curation/packet';

export interface CuratorCallRequest {
  packet: CuratorTaskPacket;
  /** Present only on the second call; rendered after the cached instructions. */
  correction?: CuratorCorrection;
  /** Absolute `curations/<curationId>/`; the agent writes `session.jsonl` there. */
  curationDir: string;
  /** The 120 s per-call signal joined to the 300 s whole-curation signal. */
  signal: AbortSignal;
}

/** One Curator call's result; `usd` is what that call billed (0 in mock mode). */
export type CuratorCallResult =
  | { status: 'ok'; output: CuratorOutput; sessionId: SessionId; usd: number }
  | { status: 'schema-invalid'; issues: string[]; sessionId: SessionId; usd: number }
  | { status: 'failed'; reason: 'call-timeout' | 'provider-error' | 'rate-limited'; sessionId: SessionId; usd: number };

/**
 * The Curator (SPEC 0005 section 4.3, C6): exactly one model call per `call`, no tools and no
 * internal schema loop; the watcher's curation step owns the 2-call cap.
 */
export interface CuratorPort {
  call(request: CuratorCallRequest): Promise<CuratorCallResult>;
}

export interface CurationCostRecordRequest {
  curationId: CurationId;
  /** Absolute `curations/<curationId>/`; the ledger writes `cost.json` there. */
  curationDir: string;
  session: CurationCostSession;
}

export interface CurationWorstCaseRequest {
  modelId: string;
  inputChars: number;
  maxOutputTokens: number;
}

/**
 * Curation cost accounting (SPEC 0005 sections 4.3 and 5.8, C6). `record` appends one billed call
 * to `cost.json`; `worstCaseUsd` prices `ceil(inputChars / 3)` input tokens plus
 * `maxOutputTokens` output tokens (B7), checked before each call against the $1.00 bound.
 */
export interface CurationCostPort {
  record(request: CurationCostRecordRequest): Promise<void>;
  worstCaseUsd(request: CurationWorstCaseRequest): Promise<number>;
}
