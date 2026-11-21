import { type PublicationAttempt } from '@prisma/client';
import { PublishAttemptViewSchema, type PublishAttemptView } from '@studio/shared/api';
import { type PublishStateFile } from '@studio/shared/platforms';
import { PlatformRowCorruptError } from '../platforms.errors';

/**
 * One attempt as the dialog shows it (C10 rev 7 `PublishAttemptView`): the row's state, and the
 * progress of `state.json` when the file describes that same state. No title, caption or tag
 * exists in either. A row that breaks the contract is `PlatformRowCorruptError`, never guessed.
 */
export function toPublishAttemptView(row: PublicationAttempt, stateFile: PublishStateFile | null): PublishAttemptView {
  const current = stateFile !== null && stateFile.state === row.state ? stateFile : null;
  const view = PublishAttemptViewSchema.safeParse({
    attemptId: row.id,
    runId: row.runId,
    platform: row.platform,
    mode: row.mode,
    state: row.state,
    since: current === null ? row.updatedAt.toISOString() : current.since,
    bytesSent: current === null ? 0 : current.bytesSent,
    bytesTotal: current === null ? Number(row.artifactBytes) : current.bytesTotal,
    reasonId: row.reasonId,
    expiresAt: row.expiresAt.toISOString(),
    publicationId: row.publicationId,
    requestedAt: row.requestedAt.toISOString(),
  });
  if (!view.success) throw new PlatformRowCorruptError(row.id);
  return view.data;
}
