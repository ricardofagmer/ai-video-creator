import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { voiceSampleBounds, type VoiceSampleAudio as VoiceSampleAudioFormat } from '@studio/shared/asset-jobs';
import { assetJobDirectory, assetJobFilePath } from '@studio/shared/asset-jobs/files';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobVersions } from '../asset-job-versions';
import { AssetJobSampleNotReadyError } from '../asset-jobs.errors';
import { GetVoiceSampleAudioQuery, type VoiceSampleAudio } from './get-voice-sample-audio.query';

const contentTypeOf: Readonly<Record<VoiceSampleAudioFormat, VoiceSampleAudio['contentType']>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

const fileKeyOf: Readonly<Record<VoiceSampleAudioFormat, 'sampleMp3' | 'sampleWav'>> = { mp3: 'sampleMp3', wav: 'sampleWav' };

/**
 * Reads only. The clip must be a regular file directly inside the job folder: `lstat`, not `stat`,
 * so a symlink planted in the folder can never point the stream at another file. Every refusal is
 * the same 404, so the response never tells which check failed; the log names the check, never
 * the path (the clone's clip is derived biometric material).
 */
@QueryHandler(GetVoiceSampleAudioQuery)
export class GetVoiceSampleAudioHandler implements IQueryHandler<GetVoiceSampleAudioQuery, VoiceSampleAudio> {
  private readonly logger = new Logger(GetVoiceSampleAudioHandler.name);

  constructor(
    private readonly versions: AssetJobVersions,
    private readonly store: AssetJobStore,
  ) {}

  async execute(query: GetVoiceSampleAudioQuery): Promise<VoiceSampleAudio> {
    const { ref } = await this.versions.voice(query.target);
    const lookup = await this.store.read('voice-sample', ref);
    if (lookup.status === 'none' || lookup.job.status !== 'done') throw new AssetJobSampleNotReadyError(ref);
    const { job } = lookup;
    // The schema requires both on a done sample; the guard keeps the types honest without a cast.
    if (job.audio === undefined || job.engine === undefined || job.mode === undefined) throw new AssetJobSampleNotReadyError(ref);

    const location = this.store.location('voice-sample', ref);
    const directory = assetJobDirectory(location);
    const absolutePath = assetJobFilePath(location, fileKeyOf[job.audio]);
    if (dirname(absolutePath) !== directory) throw this.refuse(ref, 'outside-job-folder');
    let sizeBytes: number;
    try {
      // The folder too: a job folder swapped for a symlink must not lead the stream elsewhere.
      if (!(await lstat(directory)).isDirectory()) throw this.refuse(ref, 'folder-not-a-directory');
      const stats = await lstat(absolutePath);
      if (!stats.isFile()) throw this.refuse(ref, 'not-a-regular-file');
      sizeBytes = stats.size;
    } catch (error) {
      if (error instanceof AssetJobSampleNotReadyError) throw error;
      throw this.refuse(ref, 'clip-unreadable');
    }
    if (sizeBytes === 0 || sizeBytes > voiceSampleBounds.audioMaxBytes) throw this.refuse(ref, 'clip-size-out-of-bounds');
    return { absolutePath, contentType: contentTypeOf[job.audio], sizeBytes, engine: job.engine, mode: job.mode };
  }

  private refuse(ref: string, check: string): AssetJobSampleNotReadyError {
    this.logger.warn({ event: 'asset-job.sample-refused', ref, check });
    return new AssetJobSampleNotReadyError(ref);
  }
}
