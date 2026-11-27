import { Query } from '@nestjs/cqrs';
import { type VoiceSampleEngine } from '@studio/shared/asset-jobs';
import { type AssetJobTarget } from '../asset-jobs.input';

/**
 * The kept clip of a `done` voice sample, for the api to stream with `Cache-Control: no-store`.
 * `absolutePath` is derived biometric material when the voice is the clone: the api streams it and
 * never logs, returns or embeds it.
 */
export interface VoiceSampleAudio {
  absolutePath: string;
  contentType: 'audio/mpeg' | 'audio/wav';
  sizeBytes: number;
  engine: VoiceSampleEngine;
  mode: 'live' | 'mock';
}

/** `GET .../voice-sample/audio`: 404 `asset-job-sample-not-ready` unless the job is `done` with its clip. */
export class GetVoiceSampleAudioQuery extends Query<VoiceSampleAudio> {
  /** Validated by the handler. */
  constructor(readonly target: AssetJobTarget) {
    super();
  }
}
