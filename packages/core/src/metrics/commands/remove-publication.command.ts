import { Command } from '@nestjs/cqrs';
import { type RemovePublicationResponse } from '@studio/shared/api';
import { type RemovePublicationInput } from '../metrics.input';

/**
 * `DELETE /runs/:runId/publications/:publicationId` (SPEC 0006 section 4.4): removes a wrong link,
 * only while the publication has no snapshot (409 `publication-has-metrics` otherwise).
 */
export class RemovePublicationCommand extends Command<RemovePublicationResponse> {
  /** Validated by the handler. */
  constructor(readonly input: RemovePublicationInput) {
    super();
  }
}
