import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PublishAttemptSyncModule } from './publish-attempt-sync.module';
import { PublishResponseAssembler } from './publish-response.assembler';
import { PublishingController } from './publishing.controller';

/**
 * Http side of publishing (SPEC 0007 R4-04). The `RequestPublish`, cancel and sync handlers and the
 * dialog query come from core `PlatformsModule`, imported by the root. Nothing in this folder makes
 * an outbound request, uploads a byte or writes a file itself (AC 52, AC 57): the watcher uploads.
 */
@Module({
  imports: [CqrsModule, PublishAttemptSyncModule],
  controllers: [PublishingController],
  providers: [PublishResponseAssembler],
})
export class PublishingApiModule {}
