import { Command } from '@nestjs/cqrs';
import { type CurationView } from '@studio/shared/api';
import { type RequestCurationInput } from '../curation.input';

/**
 * `POST /curations` (SPEC 0005 section 5.1): selector, queue, spend gate, then the exclusive
 * `curations/<ULID>/` folder with `curation.json` `requested`. The first failure refuses and
 * nothing is written or spent.
 */
export class RequestCurationCommand extends Command<CurationView> {
  /** Validated by the handler. */
  constructor(readonly input: RequestCurationInput) {
    super();
  }
}
