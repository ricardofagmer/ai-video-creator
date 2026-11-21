import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PathsModule } from '../paths/paths.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CancelPublishHandler } from './commands/cancel-publish.handler';
import { CompleteConnectionHandler } from './commands/complete-connection.handler';
import { DisconnectHandler } from './commands/disconnect.handler';
import { RequestPublishHandler } from './commands/request-publish.handler';
import { SetPlatformGateHandler } from './commands/set-platform-gate.handler';
import { StartConnectionHandler } from './commands/start-connection.handler';
import { SyncPublishAttemptsHandler } from './commands/sync-publish-attempts.handler';
import { InMemoryOAuthStateStore, OAUTH_STATE_STORE } from './oauth/oauth-state.store';
import { PlatformWriteQueue } from './platform-write.queue';
import { PlatformsReadModule } from './platforms-read.module';
import { PublicationAttemptRepository } from './publish/publication-attempt.repository';
import { PublicationLinker } from './publish/publication-linker';
import { RunBiometricAssets } from './publish/run-biometric-assets';
import { RunPublishFacts } from './publish/run-publish-facts';
import { GetPlatformsHandler } from './queries/get-platforms.handler';
import { GetRunPublishHandler } from './queries/get-run-publish.handler';

/**
 * Platforms for the api and the CLI (SPEC 0007 sections 5.2 to 5.4, C10 rev 7): the owner's gates,
 * connect (start and callback), disconnect, `RequestPublish`, cancel, `PublishAttemptSync`, and the
 * `GET /platforms` and `GET /runs/:runId/publish` reads. The only writer of `gates.json`,
 * `account.json`, `request.json`, the `cancel` marker and `publication_attempts`; it never writes
 * `claim`, `state.json`, `health.json` or `cursor.json` (the watcher's, K2). The pending OAuth
 * `state` entries live in this process's memory only. The composition root registers
 * `CqrsModule.forRoot()`; the watcher imports `PlatformsReadModule` instead.
 */
@Module({
  imports: [CqrsModule, PathsModule, PrismaModule, PlatformsReadModule],
  providers: [
    { provide: OAUTH_STATE_STORE, useClass: InMemoryOAuthStateStore },
    PlatformWriteQueue,
    RunPublishFacts,
    RunBiometricAssets,
    PublicationAttemptRepository,
    PublicationLinker,
    SetPlatformGateHandler,
    StartConnectionHandler,
    CompleteConnectionHandler,
    DisconnectHandler,
    RequestPublishHandler,
    CancelPublishHandler,
    SyncPublishAttemptsHandler,
    GetPlatformsHandler,
    GetRunPublishHandler,
  ],
  exports: [PlatformsReadModule],
})
export class PlatformsModule {}
