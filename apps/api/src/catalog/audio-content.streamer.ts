import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import { AudioContentUnavailableError, type StoredAudioContent } from '@studio/core/catalog';
import { type AssetRef } from '@studio/shared/catalog';
import { type Response } from 'express';
import { parseByteRange } from '../runs/byte-range';

export interface AudioStreamRequest {
  ref: AssetRef;
  audio: StoredAudioContent;
  rangeHeader: string | undefined;
  response: Response;
}

/** A version's bytes never change (content-addressed), so the browser may keep the track a day. */
const AUDIO_CACHE_CONTROL = 'private, max-age=86400';

function errnoCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 32) : null;
}

/**
 * Streams a stored music track for the "Listen" button (docs/specs/2026-11-25-music-preview.md).
 * The blob is opened without following a link and must still have the size the catalog recorded.
 * `Range` is honoured the way the run artifact route honours it, so a browser `<audio>` element
 * can seek. Any refusal is the same 404; the log names the ref and the failed check, never the path.
 */
@Injectable()
export class AudioContentStreamer {
  private readonly logger = new Logger(AudioContentStreamer.name);

  async stream(request: AudioStreamRequest): Promise<StreamableFile> {
    const { ref, audio, rangeHeader, response } = request;
    const handle = await this.openBlob(ref, audio);
    let range: ReturnType<typeof parseByteRange>;
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size !== audio.sizeBytes) throw this.refuse(ref, 'blob-changed', null);
      range = parseByteRange(rangeHeader, audio.sizeBytes);
    } catch (error) {
      await handle.close();
      throw error;
    }
    const start = range.kind === 'partial' ? range.start : 0;
    const end = range.kind === 'partial' ? range.end : audio.sizeBytes - 1;
    const stream = handle.createReadStream({ start, end });
    // Closing the stream closes the handle (autoClose), also when the client leaves mid-track.
    response.on('close', () => stream.destroy());
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', AUDIO_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.removeHeader('ETag');
    response.removeHeader('Last-Modified');
    if (range.kind === 'partial') {
      response.status(206);
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${audio.sizeBytes}`);
    }
    return new StreamableFile(stream, { type: audio.contentType, disposition: 'inline', length: end - start + 1 });
  }

  /** O_NOFOLLOW refuses a blob swapped for a link. */
  private async openBlob(ref: AssetRef, audio: StoredAudioContent): Promise<FileHandle> {
    try {
      return await open(audio.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      // The fs error message names the path, so only its errno code is kept.
      throw this.refuse(ref, 'blob-unopenable', errnoCode(error));
    }
  }

  private refuse(ref: AssetRef, check: string, errno: string | null): AudioContentUnavailableError {
    this.logger.warn({ event: 'catalog.audio-stream-refused', ref, check, errno });
    return new AudioContentUnavailableError(ref, 'missing');
  }
}
