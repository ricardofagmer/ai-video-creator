import { Injectable } from '@nestjs/common';
import { SerialMutex } from '../runtime/keyed-mutex';

/**
 * Serializes this process's read-decide-write sequences on platform files and attempt rows
 * (`gates.json`, `account.json`, `RequestPublish`, `PublishAttemptSync`), so two requests of the
 * same api cannot interleave between the read and the write. Across processes the files rely on
 * their own guards: `token.lock`, O_EXCL folders and markers, and the SQLite unique indexes.
 */
@Injectable()
export class PlatformWriteQueue {
  private readonly mutex = new SerialMutex();

  exclusive<Result>(work: () => Promise<Result>): Promise<Result> {
    return this.mutex.run(work);
  }
}
