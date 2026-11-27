import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import { ImageContentUnavailableError, type StoredImageContent } from '@studio/core/catalog';
import { type AssetRef } from '@studio/shared/catalog';
import { type Response } from 'express';

export interface ImageStreamRequest {
  ref: AssetRef;
  image: StoredImageContent;
  response: Response;
}

/** A version's bytes never change (content-addressed), so the browser may keep the thumbnail a day. */
const IMAGE_CACHE_CONTROL = 'private, max-age=86400';

function errnoCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 32) : null;
}

/**
 * Streams a stored image for the catalog thumbnail. The blob is opened without following a link
 * and must still have the size the catalog recorded; any refusal is the same 404
 * `image-content-unavailable`, and the log names the ref and the failed check, never the path.
 */
@Injectable()
export class ImageContentStreamer {
  private readonly logger = new Logger(ImageContentStreamer.name);

  async stream(request: ImageStreamRequest): Promise<StreamableFile> {
    const { ref, image, response } = request;
    const handle = await this.openBlob(ref, image);
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size !== image.sizeBytes) throw this.refuse(ref, 'blob-changed', null);
    } catch (error) {
      await handle.close();
      throw error;
    }
    const stream = handle.createReadStream();
    // Closing the stream closes the handle (autoClose), also when the client leaves early.
    response.on('close', () => stream.destroy());
    response.setHeader('Cache-Control', IMAGE_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.removeHeader('ETag');
    response.removeHeader('Last-Modified');
    return new StreamableFile(stream, { type: image.contentType, disposition: 'inline', length: image.sizeBytes });
  }

  /** O_NOFOLLOW refuses a blob swapped for a link. */
  private async openBlob(ref: AssetRef, image: StoredImageContent): Promise<FileHandle> {
    try {
      return await open(image.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      // The fs error message names the path, so only its errno code is kept.
      throw this.refuse(ref, 'blob-unopenable', errnoCode(error));
    }
  }

  private refuse(ref: AssetRef, check: string, errno: string | null): ImageContentUnavailableError {
    this.logger.warn({ event: 'catalog.image-stream-refused', ref, check, errno });
    return new ImageContentUnavailableError(ref, 'missing');
  }
}
