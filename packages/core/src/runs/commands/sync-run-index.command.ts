import { Command } from '@nestjs/cqrs';
import { type RunIndexEntry } from '../run-index.mapper';

/**
 * Mirrors one run folder into its index row, e.g. after the api records a review decision or
 * sees a watcher finish. The row is overwritten from run.json (files win).
 */
export class SyncRunIndexCommand extends Command<RunIndexEntry> {
  /** C3 `RunId`; validated by the handler. */
  constructor(readonly runId: string) {
    super();
  }
}
