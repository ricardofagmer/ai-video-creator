import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PublishAttemptSync } from './publish-attempt.sync';

/**
 * One `PublishAttemptSync` for the api process (SPEC 0007 section 5.4), shared by the publish
 * dialog and the publications read. The handler comes from core `PlatformsModule`, imported by the root.
 */
@Module({
  imports: [CqrsModule],
  providers: [PublishAttemptSync],
  exports: [PublishAttemptSync],
})
export class PublishAttemptSyncModule {}
