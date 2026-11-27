import { isDeepStrictEqual } from 'node:util';

export type AppendSessionResult<File> =
  | { outcome: 'appended'; file: File }
  /** The identical session was already in the file: recording is idempotent (crash resume). */
  | { outcome: 'already-recorded'; file: File };

export interface AppendSessionInput<Session, File extends { sessions: readonly Session[] }> {
  /** The source's cost.json as read through its shared helper; null before the first billed call. */
  existing: File | null;
  session: Session;
  /** Whether a recorded session carries the dedupe key of `session`. */
  hasSameKey: (recorded: Session) => boolean;
  /** The error for a recorded session with the same key but other values. */
  conflictError: () => Error;
  /** Source-specific refusals that apply only to a genuinely new session (for example a size cap). */
  assertAppendable?: (previous: readonly Session[]) => void;
  /** The next file content; its `totalUsd` must be recomputed from `sessions`, never accumulated. */
  buildFile: (sessions: Session[]) => File;
}

/**
 * Pure: the append rule every cost.json source shares (run, curation, asset job). The same key
 * with the same values is a no-op, so a retried write never bills twice; the same key with other
 * values is a conflict. Each source keeps its own file shape, identity checks and dedupe key.
 */
export function appendSessionToFile<Session, File extends { sessions: readonly Session[] }>(
  input: AppendSessionInput<Session, File>,
): AppendSessionResult<File> {
  const { existing, session } = input;
  const previous = existing?.sessions ?? [];
  const sameKey = previous.find(input.hasSameKey);
  if (sameKey !== undefined && existing !== null) {
    if (isDeepStrictEqual(sameKey, session)) return { outcome: 'already-recorded', file: existing };
    throw input.conflictError();
  }
  input.assertAppendable?.(previous);
  return { outcome: 'appended', file: input.buildFile([...previous, session]) };
}
