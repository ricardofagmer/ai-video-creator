import { Command } from '@nestjs/cqrs';
import { type CurationView } from '@studio/shared/api';
import { type DecideCurationInput } from '../curation.input';

/**
 * `POST /curations/:curationId/decision` (SPEC 0005 section 5.7), only on the owner's action:
 * `save-draft` saves the proposal as a `draft` version with provenance `{type: 'curator',
 * curationId}`; `decline` records the optional reason; `compare` creates, and does not start, a
 * comparison with the saved draft as arm B. No action makes any version `active` (AC 35).
 */
export class DecideCurationCommand extends Command<CurationView> {
  /** Validated by the handler. */
  constructor(readonly input: DecideCurationInput) {
    super();
  }
}
