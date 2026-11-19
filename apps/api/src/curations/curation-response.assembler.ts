import { Injectable } from '@nestjs/common';
import { type CurationPageView, type CurationView } from '@studio/shared/api';
import { CurationCostIndexSync } from './curation-cost-index.service';

/**
 * Answers of the curation routes. Core already validates each `CurationView` against the frozen
 * C10 rev 4 schema; the api adds the one rule it owns: a single curation answered in a terminal
 * status has its cost indexed first (B16), so the cost pages see it on the next read. Lists are
 * answered as read, without indexing, so a page of 100 never issues 100 commands.
 */
@Injectable()
export class CurationResponseAssembler {
  constructor(private readonly costIndex: CurationCostIndexSync) {}

  async one(view: CurationView): Promise<CurationView> {
    await this.costIndex.indexIfTerminal(view);
    return view;
  }

  page(page: CurationPageView): CurationPageView {
    return { items: page.items, total: page.total, nextCursor: page.nextCursor };
  }
}
