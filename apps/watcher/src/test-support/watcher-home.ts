import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * Temp folder of SPEC 2026-11-21-r1-r2-curator-coverage section 8.2 (rev 1): a realpath'd mkdtemp
 * folder under os.tmpdir(), removed by `close()`. Test-only: nothing in the product imports it.
 */

/** Bounded so a prefix can never carry a path segment out of os.tmpdir(). */
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

export class InvalidWatcherHomePrefixError extends Error {
  constructor(readonly prefix: string) {
    super('watcher home prefix must be 1 to 48 lowercase letters, digits or dashes');
    this.name = 'InvalidWatcherHomePrefixError';
  }
}

/** A throwaway folder for one test; call `close()` in `afterEach`. A second `close()` is a no-op. */
export async function createWatcherHome(options: { prefix: string }): Promise<{ root: string; close(): Promise<void> }> {
  if (!PREFIX_PATTERN.test(options.prefix)) throw new InvalidWatcherHomePrefixError(options.prefix);
  const root = await mkdtemp(join(await realpath(tmpdir()), `${options.prefix}-`));
  let closed = false;
  return {
    root,
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await rm(root, { recursive: true, force: true });
    },
  };
}
