import { Module } from '@nestjs/common';
import { PathsModule } from '../paths/paths.module';
import { ContentStore } from './content-store';
import { ContentVerifier } from './content-verifier';
import { FolderReader } from './folder-reader';
import { ReferenceInspector } from './reference-inspector';

@Module({
  imports: [PathsModule],
  providers: [ContentStore, ReferenceInspector, ContentVerifier, FolderReader],
  exports: [ContentStore, ReferenceInspector, ContentVerifier, FolderReader],
})
export class AssetStoreModule {}
