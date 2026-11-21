import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PublishAttemptView } from '@studio/shared/api';
import { PlatformSchema, type Platform } from '@studio/shared/platforms';
import { createCancelMarker } from '@studio/shared/platforms/files';
import { PlatformError, PlatformRefusedError, PlatformRowCorruptError, PublishAttemptNotFoundError } from '../platforms.errors';
import { CancelPublishInputSchema, parsePlatformInput } from '../platforms.input';
import { PLATFORM_FILE_ROOT } from '../platform-runtime';
import { toPublishAttemptView } from '../publish/publication-attempt.mapper';
import { PublicationAttemptRepository } from '../publish/publication-attempt.repository';
import { PublishFileReader } from '../stores/publish-file.reader';
import { CancelPublishCommand } from './platform.commands';

/**
 * SPEC 0007 section 5.4 "Cancel": an empty O_EXCL `cancel` marker, only while the watcher has not
 * claimed the attempt (`publish-attempt-not-cancellable` otherwise, nothing written). The row moves
 * from `queued` to `cancelled` at once; the watcher writes `cancelled` to `state.json` when it next
 * looks, and checks the marker again right after its claim, so a cancel that races the claim wins
 * and no byte is sent. Cancelling an attempt already cancelled answers the same view.
 */
@CommandHandler(CancelPublishCommand)
export class CancelPublishHandler implements ICommandHandler<CancelPublishCommand, PublishAttemptView> {
  private readonly logger = new Logger(CancelPublishHandler.name);

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    private readonly attempts: PublicationAttemptRepository,
    private readonly publishFiles: PublishFileReader,
  ) {}

  async execute(command: CancelPublishCommand): Promise<PublishAttemptView> {
    const { runId, attemptId, correlationId } = parsePlatformInput(CancelPublishInputSchema, command.input);
    const row = await this.attempts.findInRun(runId, attemptId);
    if (row === null) throw new PublishAttemptNotFoundError(runId, attemptId);
    const platform = platformOf(row.platform, attemptId);
    try {
      if (row.state === 'cancelled') return toPublishAttemptView(row, await this.publishFiles.readState(attemptId));
      if (row.state !== 'queued') throw new PlatformRefusedError('publish-attempt-not-cancellable', platform, attemptId);
      const marker = await createCancelMarker(this.platformRoot, attemptId);
      if (marker === 'claimed') throw new PlatformRefusedError('publish-attempt-not-cancellable', platform, attemptId);
      await this.attempts.moveState({ attemptId, from: 'queued', change: { state: 'cancelled', reasonId: null } });
      this.logger.log({ event: 'publish.cancelled', runId, attemptId, platform, marker, correlationId });
    } catch (error) {
      if (error instanceof PlatformError) {
        this.logger.log({ event: 'publish.cancel-refused', runId, attemptId, platform, reason: error.reason, correlationId });
      }
      throw error;
    }
    const current = await this.attempts.findInRun(runId, attemptId);
    if (current === null) throw new PublishAttemptNotFoundError(runId, attemptId);
    return toPublishAttemptView(current, await this.publishFiles.readState(attemptId));
  }
}

function platformOf(value: string, attemptId: string): Platform {
  const platform = PlatformSchema.safeParse(value);
  if (!platform.success) throw new PlatformRowCorruptError(attemptId);
  return platform.data;
}
