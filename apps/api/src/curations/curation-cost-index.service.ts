import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { IndexCurationCostCommand } from '@studio/core/costs';
import { type CurationView } from '@studio/shared/api';
import { isTerminalCurationStatus } from '@studio/shared/curation';

/**
 * Mirrors a settled curation's `cost.json` into `cost_entries` with `source_kind = 'curation'`
 * (SPEC 0005 section 5.7, B16), the curation counterpart of `RunIndexSync`. Only a terminal
 * curation is indexed: the watcher no longer writes its cost file then. The command is idempotent,
 * so a repeated read inserts nothing; a failure is logged by id and error name and never fails the
 * request that observed the curation (month-to-date also scans unindexed curation sessions).
 */
@Injectable()
export class CurationCostIndexSync {
  private readonly logger = new Logger(CurationCostIndexSync.name);

  constructor(private readonly commandBus: CommandBus) {}

  async indexIfTerminal(view: CurationView): Promise<void> {
    if (!isTerminalCurationStatus(view.status)) return;
    try {
      await this.commandBus.execute(new IndexCurationCostCommand({ curationId: view.curationId }));
    } catch (error) {
      this.logger.warn({ event: 'costs.curation-index-failed', curationId: view.curationId, error: errorName(error) });
    }
  }
}

/** Error names only: these logs never need the message. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
