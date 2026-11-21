import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MetricInboxSyncModule } from '../metrics/metric-inbox-sync.module';
import { ConnectionCallbackController } from './connection-callback.controller';
import { PlatformResponseAssembler } from './platform-response.assembler';
import { PlatformsController } from './platforms.controller';

/**
 * Http side of platform connections and gates (SPEC 0007 R4-04). The handlers, the in-memory OAuth
 * `state` store and the token vault come from core `PlatformsModule`, imported by the root; this
 * module only validates, dispatches and conforms answers. The api writes `gates.json` and
 * `account.json` only through those handlers and never `health.json`, `claim`, `state.json`,
 * `cursor.json` or `publications.jsonl` (AC 57).
 */
@Module({
  imports: [CqrsModule, MetricInboxSyncModule],
  controllers: [PlatformsController, ConnectionCallbackController],
  providers: [PlatformResponseAssembler],
})
export class ConnectionsApiModule {}
