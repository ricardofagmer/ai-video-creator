import { Controller, Get, Header } from '@nestjs/common';
import { apiRouteSegments, type WatcherStatusResponse } from '@studio/shared/api';
import { WatcherStatusReader } from './watcher-status.reader';

/**
 * `GET /watcher` (SPEC 0002 rev 4, C10). Not public: it sits behind the global `SessionGuard`
 * like every route but `health` and `auth/login`, and answers 401 without a session.
 */
@Controller(apiRouteSegments.watcher)
export class WatcherController {
  constructor(private readonly status: WatcherStatusReader) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  read(): Promise<WatcherStatusResponse> {
    return this.status.read();
  }
}
