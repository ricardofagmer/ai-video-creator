import { Module } from '@nestjs/common';
import { PathsModule } from '@studio/core/paths';
import { WatcherController } from './watcher.controller';
import { WatcherStatusReader } from './watcher-status.reader';

/** Http side of the watcher heartbeat (SPEC 0002 rev 4, section 13.3); read-only. */
@Module({
  imports: [PathsModule],
  controllers: [WatcherController],
  providers: [WatcherStatusReader],
})
export class WatcherApiModule {}
