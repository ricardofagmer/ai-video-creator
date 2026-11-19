import { type ModelRoleName } from '@studio/shared/agents';
import { type AssetRef, type AssetVersion } from '@studio/shared/catalog';
import { type RunId, type StepKey } from '@studio/shared/run-format';
import { type SampledFrame } from './tool-results';

/** Map with a fixed capacity; the least recently used entry leaves first. */
export class BoundedCache<Key, Value> {
  private readonly entries = new Map<Key, Value>();

  constructor(private readonly capacity: number) {}

  get(key: Key): Value | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: Key, value: Value): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * One catalog query of CatalogSearchTool, memoized for the step (topology 3.2 memo key). Rows are
 * kept unredacted server-side; redaction and the 4,000-character page cut run on every call.
 */
export interface CatalogPage {
  /** Guard-filtered rows of the keyset page, in catalog order. */
  readonly fetched: readonly AssetVersion[];
  /** Keyset cursor after `fetched`, or null when the catalog has no more rows. */
  readonly nextKeyset: string | null;
  /** Matching versions in total. */
  readonly total: number;
}

/** Twelve tool calls per agent call at most; a page per call is plenty. */
const CATALOG_PAGES_PER_STEP = 24;
/** 24 frames per step (topology 3.2); one memo slot per frame. */
const FRAMES_PER_STEP_MEMO = 24;

/**
 * Server-side state of one engine step (`runId::stepKey`), shared by the agent calls of that
 * step: the frame counter of topology 3.2, the per-role `offeredRefs` set that grows with
 * CatalogSearchTool results, and the step-lived memos.
 */
export class StepToolState {
  private framesUsed = 0;
  private readonly offered = new Map<ModelRoleName, Set<AssetRef>>();
  readonly catalogPages = new BoundedCache<string, CatalogPage>(CATALOG_PAGES_PER_STEP);
  readonly frames = new BoundedCache<string, SampledFrame>(FRAMES_PER_STEP_MEMO);

  /**
   * Reserves `count` frames against the per-step budget, synchronously so two concurrent calls
   * cannot both pass the check. Returns false and reserves nothing when the budget would be crossed.
   */
  reserveFrames(count: number, budget: number): boolean {
    if (this.framesUsed + count > budget) return false;
    this.framesUsed += count;
    return true;
  }

  /** Gives back frames reserved for a call that produced none. */
  releaseFrames(count: number): void {
    this.framesUsed = Math.max(0, this.framesUsed - count);
  }

  offeredRefsOf(role: ModelRoleName, seed: readonly AssetRef[]): Set<AssetRef> {
    const existing = this.offered.get(role);
    if (existing !== undefined) {
      for (const ref of seed) existing.add(ref);
      return existing;
    }
    const created = new Set<AssetRef>(seed);
    this.offered.set(role, created);
    return created;
  }
}

/** Steps whose state is kept; older steps are finished, so their state is dropped first. */
const STEPS_KEPT = 8;

export class StepStateRegistry {
  private readonly states = new BoundedCache<string, StepToolState>(STEPS_KEPT);

  stateFor(runId: RunId, stepKey: StepKey): StepToolState {
    const key = `${runId}::${stepKey}`;
    const existing = this.states.get(key);
    if (existing !== undefined) return existing;
    const created = new StepToolState();
    this.states.set(key, created);
    return created;
  }
}
