import { Command } from '@nestjs/cqrs';
import { type VoiceSampleJobFile } from '@studio/shared/asset-jobs';
import { type RequestVoiceSampleInput } from '../asset-jobs.input';

/**
 * `POST /catalog/assets/:assetId/versions/:version/voice-sample` (guided-creation design section
 * 2). Idempotent: an open job, or a kept `done` one, is returned as it is. A `done` sample is
 * replaced when the owner asks (`replace`) or when it was a mock and the voice's provider is now
 * live; a `failed` or `refused` one is always replaced. The sentence is fixed per language.
 */
export class RequestVoiceSampleCommand extends Command<VoiceSampleJobFile> {
  /** Validated by the handler. */
  constructor(readonly input: RequestVoiceSampleInput) {
    super();
  }
}
