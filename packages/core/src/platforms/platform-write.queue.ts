import { Injectable } from '@nestjs/common';

/**
 * Serializes this process's read-decide-write sequences on platform files and attempt rows
 * (`gates.json`, `account.json`, `RequestPublish`, `PublishAttemptSync`), so two requests of the
 * same api cannot interleave between the read and the write. Across processes the files rely on
 * their own guards: `token.lock`, O_EXCL folders and markers, and the SQLite unique indexes.
 */
@Injectable()
export class PlatformWriteQueue {
  private tail: Promise<void> = Promise.resolve();

  exclusive<Result>(work: () => Promise<Result>): Promise<Result> {
    const run = this.tail.then(work, work);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
