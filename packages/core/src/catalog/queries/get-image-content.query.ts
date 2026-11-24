import { Query } from '@nestjs/cqrs';

/** Where a stored image's bytes are and how to serve them; the path never leaves the api. */
export interface StoredImageContent {
  absolutePath: string;
  contentType: string;
  sizeBytes: number;
}

/** The stored bytes of an image version, for the catalog thumbnail (images upload, 2026-11-24). */
export class GetImageContentQuery extends Query<StoredImageContent> {
  /** C1 `AssetRef`; validated by the handler. */
  constructor(readonly ref: string) {
    super();
  }
}
