import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { RunIdSchema, displayedRunStatus, type RunStatus } from '@studio/shared/run-format';
import { parseReviewInput } from '../review-input';
import { ReviewRunAccess } from '../review-run-access';
import { RunNotDeletableError } from '../review.errors';
import { RunLocks } from '../run-locks';
import { RunRemovalRepository } from '../run-removal.repository';
import { DeleteRunCommand, type DeleteRunResult } from './delete-run.command';

/** A watcher may claim a queued run and is writing a running one. */
const undeletableStatuses: readonly RunStatus[] = ['pending', 'running'];

@CommandHandler(DeleteRunCommand)
export class DeleteRunHandler implements ICommandHandler<DeleteRunCommand, DeleteRunResult> {
  private readonly logger = new Logger(DeleteRunHandler.name);

  constructor(
    private readonly runs: ReviewRunAccess,
    private readonly locks: RunLocks,
    private readonly removal: RunRemovalRepository,
  ) {}

  async execute(command: DeleteRunCommand): Promise<DeleteRunResult> {
    const runId = parseReviewInput(RunIdSchema, command.input.runId, 'runId');
    return this.locks.withRun(runId, async () => {
      const loaded = await this.runs.load(runId);
      const watcherAlive = await this.runs.isWatcherAlive(loaded.runDir);
      const shown = displayedRunStatus(loaded.run.state, watcherAlive);
      if (watcherAlive) throw new RunNotDeletableError(runId, shown, 'live-watcher');
      if (undeletableStatuses.includes(shown)) throw new RunNotDeletableError(runId, shown, 'status');
      if (loaded.run.comparison !== undefined) throw new RunNotDeletableError(runId, shown, 'comparison-arm');
      if (await this.removal.hasOutcome(runId)) throw new RunNotDeletableError(runId, shown, 'reviewed');

      // The rename is atomic and its name is not a RunId, so no reader or rebuild sees a half-deleted
      // run; the index row goes next, and only then the files.
      const trash = join(dirname(loaded.runDir), `.deleted-${runId}-${randomUUID()}`);
      await rename(loaded.runDir, trash);
      await this.removal.removeIndexRow(runId);
      await rm(trash, { recursive: true, force: true });
      this.logger.log({ event: 'review.run-deleted', runId, status: shown });
      return { runId };
    });
  }
}
