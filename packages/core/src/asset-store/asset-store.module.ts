import { Module } from '@nestjs/common';
import { PathsModule } from '../paths/paths.module';
import { ContentStore } from './content-store';
import { ContentVerifier } from './content-verifier';
import { ReferenceInspector } from './reference-inspector';

@Module({
  imports: [PathsModule],
  providers: [ContentStore, ReferenceInspector, ContentVerifier],
  exports: [ContentStore, ReferenceInspector, ContentVerifier],
})
export class AssetStoreModule {}
