import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { type PlatformsView } from '@studio/shared/api';
import { PlatformSchema } from '@studio/shared/platforms';
import { PlatformViewReader } from '../platform-view.reader';
import { GetPlatformsQuery } from './platform.queries';

/** `GET /platforms` (SPEC 0007 section 5.3): every platform's card, in `PlatformSchema` order. */
@QueryHandler(GetPlatformsQuery)
export class GetPlatformsHandler implements IQueryHandler<GetPlatformsQuery, PlatformsView> {
  constructor(private readonly views: PlatformViewReader) {}

  async execute(): Promise<PlatformsView> {
    const platforms: PlatformsView['platforms'] = [];
    // One platform at a time: each reads three small files and, in live mode, two credentials.
    for (const platform of PlatformSchema.options) platforms.push(await this.views.viewOf(platform));
    return { platforms };
  }
}
