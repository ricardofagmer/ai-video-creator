import { curationBounds, type CurationId, type CurationSubject } from '@studio/shared/curation';
import { type StoredCuration } from './curation-store';

/** The queue as the files state it (SPEC 0005 section 5.1 step 3; the files are the only source). */
export interface CurationQueue {
  /** `requested` curations, oldest first (ULID order): the watcher claims the first. */
  requested: CurationId[];
  /** The `requested` or `collecting` curation of a subject (B5), keyed by `subjectKey`. */
  openBySubject: Map<string, CurationId>;
}

/** Kind and ref together: an asset ref and a recipe ref share one pattern (L7). */
export function subjectKey(subject: CurationSubject): string {
  return `${subject.kind}:${subject.ref}`;
}

export function queueOf(stored: readonly StoredCuration[]): CurationQueue {
  const requested: CurationId[] = [];
  const openBySubject = new Map<string, CurationId>();
  for (const { curationId, file } of stored) {
    if (file.status === 'requested') requested.push(curationId);
    if (file.status === 'requested' || file.status === 'collecting') openBySubject.set(subjectKey(file.subject), curationId);
  }
  requested.sort();
  return { requested, openBySubject };
}

/** 1..3 while `requested`, else null (C10 `queuePosition`). */
export function queuePositionOf(queue: CurationQueue, curationId: CurationId): number | null {
  const index = queue.requested.indexOf(curationId);
  return index === -1 || index >= curationBounds.maxQueued ? null : index + 1;
}
