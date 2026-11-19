import type { IsoDateTime } from '../common/ids';
import type { AssetRef } from '../catalog/asset-kind';
import type { LearningNote } from '../catalog/learning-note';

/**
 * Read-only access to learning notes for the watcher's `brief` step (SPEC 0003 section 5.5). The
 * watcher binds it to a core read query; it never writes SQLite (ADR 0003). A note counts when it
 * was created at or before `cutoff` and was not retired at or before it, so a run sees the same
 * notes on every attempt. The per-ref and per-brief caps are applied by the caller.
 */
export interface LearningNotesPort {
  activeNotesFor(
    refs: readonly AssetRef[],
    cutoff: IsoDateTime,
  ): Promise<readonly { ref: AssetRef; notes: readonly LearningNote[] }[]>;
}
