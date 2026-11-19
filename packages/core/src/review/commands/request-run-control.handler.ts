import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { readControlRequest, writeControlRequest } from '@studio/shared/run-files';
import {
  RunIdSchema,
  displayedRunStatus,
  resumableStatuses,
  type ControlRequest,
  type RunStatus,
} from '@studio/shared/run-format';
import { parseReviewInput } from '../review-input';
import { ReviewRunAccess } from '../review-run-access';
import { ReviewNotAllowedError } from '../review.errors';
import { RunLocks } from '../run-locks';
import { RequestRunControlCommand, type RunControlRequest, type RunControlResult } from './request-run-control.command';

const RunControlRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pause') }).strict(),
  z.object({ kind: z.literal('stop') }).strict(),
  z.object({ kind: z.literal('resume') }).strict(),
]);

/** `pause` and `stop` reach a watcher between steps, or at the start of a pending run's execution. */
const interruptibleStatuses: readonly RunStatus[] = ['pending', 'running'];

/**
 * Merges the request into what control.json already asks. `stop` wins over `pause` in the watcher,
 * so both flags are kept; a `pause` or `stop` drops an unread `resume`, and `resume` clears both
 * because the owner asked the held run to continue.
 */
function nextControl(request: RunControlRequest, current: ControlRequest | null, at: number): ControlRequest {
  switch (request.kind) {
    case 'pause':
      return { pause: true, stop: current?.stop ?? false, at };
    case 'stop':
      return { pause: current?.pause ?? false, stop: true, at };
    case 'resume':
      return { pause: false, stop: false, resume: true, at };
  }
}

@CommandHandler(RequestRunControlCommand)
export class RequestRunControlHandler implements ICommandHandler<RequestRunControlCommand, RunControlResult> {
  private readonly logger = new Logger(RequestRunControlHandler.name);

  constructor(
    private readonly runs: ReviewRunAccess,
    private readonly locks: RunLocks,
  ) {}

  async execute(command: RequestRunControlCommand): Promise<RunControlResult> {
    const runId = parseReviewInput(RunIdSchema, command.input.runId, 'runId');
    const request = parseReviewInput(RunControlRequestSchema, command.input.request, 'request');
    return this.locks.withRun(runId, async () => {
      const loaded = await this.runs.load(runId);
      const watcherAlive = await this.runs.isWatcherAlive(loaded.runDir);
      const shown = displayedRunStatus(loaded.run.state, watcherAlive);
      if (request.kind === 'resume') {
        // A6: `resume` is written only while no watcher lives; the daemon then picks the run up.
        if (watcherAlive) throw new ReviewNotAllowedError(runId, shown, 'live-watcher');
        if (!resumableStatuses.includes(shown)) throw new ReviewNotAllowedError(runId, shown, 'status');
      } else if (!interruptibleStatuses.includes(shown)) {
        throw new ReviewNotAllowedError(runId, shown, 'status');
      }
      const current = await readControlRequest(loaded.runDir);
      const control = nextControl(request, current.status === 'present' ? current.value : null, Date.now());
      await writeControlRequest(loaded.runDir, control);
      this.logger.log({ event: 'review.control-requested', runId, kind: request.kind, status: shown });
      return { runId };
    });
  }
}
