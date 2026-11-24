import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import { AssetJobSampleNotReadyError, type VoiceSampleAudio } from '@studio/core/asset-jobs';
import { type AssetRef } from '@studio/shared/catalog';
import { type Response } from 'express';
import { parseByteRange } from '../runs/byte-range';

export interface VoiceSampleStreamRequest {
  ref: AssetRef;
  audio: VoiceSampleAudio;
  rangeHeader: string | undefined;
  response: Response;
}

function errnoCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 32) : null;
}

/**
 * Streams a kept voice sample (guided-creation design section 2). The clip of the clone is derived
 * biometric material: it is served with `no-store`, never cached, copied or named in a log, and the
 * response carries no file name. `Range` is honoured the way the run artifact route honours it, so
 * a browser `<audio>` element can seek. Every refusal is the same 404 `asset-job-sample-not-ready`;
 * the log names the ref and the failed check only, never the path.
 */
@Injectable()
export class VoiceSampleAudioStreamer {
  private readonly logger = new Logger(VoiceSampleAudioStreamer.name);

  async stream(request: VoiceSampleStreamRequest): Promise<StreamableFile> {
    const { ref, audio, rangeHeader, response } = request;
    const handle = await this.openClip(ref, audio);
    let range: ReturnType<typeof parseByteRange>;
    try {
      const stats = await handle.stat();
      // The query measured the clip with lstat; a file swapped or rewritten since is refused, not streamed.
      if (!stats.isFile() || stats.size !== audio.sizeBytes) throw this.refuse(ref, 'clip-changed', null);
      range = parseByteRange(rangeHeader, audio.sizeBytes);
    } catch (error) {
      await handle.close();
      throw error;
    }
    const start = range.kind === 'partial' ? range.start : 0;
    const end = range.kind === 'partial' ? range.end : audio.sizeBytes - 1;
    const stream = handle.createReadStream({ start, end });
    // Closing the stream closes the handle (autoClose), also when the client leaves mid-clip.
    response.on('close', () => stream.destroy());
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.removeHeader('ETag');
    response.removeHeader('Last-Modified');
    if (range.kind === 'partial') {
      response.status(206);
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${audio.sizeBytes}`);
    }
    return new StreamableFile(stream, { type: audio.contentType, disposition: 'inline', length: end - start + 1 });
  }

  /** O_NOFOLLOW refuses a final component swapped for a link after the query's lstat. */
  private async openClip(ref: AssetRef, audio: VoiceSampleAudio): Promise<FileHandle> {
    try {
      return await open(audio.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      // The fs error message names the path, so only its errno code is kept.
      throw this.refuse(ref, 'clip-unopenable', errnoCode(error));
    }
  }

  private refuse(ref: AssetRef, check: string, errno: string | null): AssetJobSampleNotReadyError {
    this.logger.warn({ event: 'asset-job.sample-stream-refused', ref, check, errno });
    return new AssetJobSampleNotReadyError(ref);
  }
}
