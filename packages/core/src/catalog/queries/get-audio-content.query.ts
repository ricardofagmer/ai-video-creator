import { Query } from '@nestjs/cqrs';

/** Where a stored music track's bytes are and how to serve them; the path never leaves the api. */
export interface StoredAudioContent {
  absolutePath: string;
  contentType: string;
  sizeBytes: number;
}

/** The stored bytes of a music version, for the "Listen" button (docs/specs/2026-11-25-music-preview.md). */
export class GetAudioContentQuery extends Query<StoredAudioContent> {
  /** C1 `AssetRef`; validated by the handler. */
  constructor(readonly ref: string) {
    super();
  }
}
