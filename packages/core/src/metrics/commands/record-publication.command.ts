import { Command } from '@nestjs/cqrs';
import { type PublicationView } from '@studio/shared/api';
import { type RecordPublicationInput } from '../metrics.input';

/**
 * `POST /runs/:runId/publications` (SPEC 0006 section 5.1): records where the owner published an
 * approved run. The URL is parsed and rebuilt, never fetched; nothing is posted anywhere.
 */
export class RecordPublicationCommand extends Command<PublicationView> {
  /** Validated by the handler. */
  constructor(readonly input: RecordPublicationInput) {
    super();
  }
}
