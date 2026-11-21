import { Inject, Injectable } from '@nestjs/common';
import { type PublishAttemptId, type PublishRequestFile, type PublishStateFile } from '@studio/shared/platforms';
import { readPublishClaim, readPublishRequest, readPublishState } from '@studio/shared/platforms/files';
import { RunFileError } from '@studio/shared/run-files';
import { PlatformFileCorruptError } from '../platforms.errors';
import { PLATFORM_FILE_ROOT } from '../platform-runtime';

/**
 * Read-only access to `publish/<attemptId>/`: `state.json` (SPEC 0007 section 4.3), which only the
 * watcher writes, absent until the watcher first decides the attempt; `request.json`, written once
 * by `RequestPublish`; and whether the watcher's `claim` exists. A file that breaks its contract is
 * `PlatformFileCorruptError`.
 */
@Injectable()
export class PublishFileReader {
  constructor(@Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string) {}

  async readState(attemptId: PublishAttemptId): Promise<PublishStateFile | null> {
    try {
      const file = await readPublishState(this.platformRoot, attemptId);
      return file.status === 'present' ? file.value : null;
    } catch (error) {
      if (error instanceof RunFileError) throw new PlatformFileCorruptError('state.json', attemptId);
      throw error;
    }
  }

  async readRequest(attemptId: PublishAttemptId): Promise<PublishRequestFile | null> {
    try {
      const file = await readPublishRequest(this.platformRoot, attemptId);
      return file.status === 'present' ? file.value : null;
    } catch (error) {
      if (error instanceof RunFileError) throw new PlatformFileCorruptError('request.json', attemptId);
      throw error;
    }
  }

  /** Whether the watcher claimed the attempt; an unreadable claim still proves it was taken. */
  async hasClaim(attemptId: PublishAttemptId): Promise<boolean> {
    return (await readPublishClaim(this.platformRoot, attemptId)).status === 'present';
  }
}
