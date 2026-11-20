import { Command } from '@nestjs/cqrs';
import { type RunIndexRebuildReport } from '../run-index.service';

/**
 * Rebuilds `run_index_entries` from every run folder (ADR 0003: `studio doctor`, and the api on
 * start). Files win on disagreement; rows without a folder are reported, never deleted.
 */
export class RebuildRunIndexCommand extends Command<RunIndexRebuildReport> {}
