import { Injectable, Logger } from '@nestjs/common';
import { PublishAttemptViewSchema, RunPublishViewSchema, type PublishAttemptView, type RunPublishView } from '@studio/shared/api';
import { conformToContract } from '../platform/response-contract';

const CONTRACT_VIOLATED_EVENT = 'publish.response-contract-violated';

/**
 * Answers of the publish routes (SPEC 0007 section 4.4, C10 rev 7). Each core result passes its
 * frozen strict schema before it leaves the api, so no title, caption, tag, URL or asset path can
 * reach the web through a contract drift: `PublishAttemptView` has no metadata field and the strict
 * parse fails on any extra one (K7).
 */
@Injectable()
export class PublishResponseAssembler {
  private readonly logger = new Logger(PublishResponseAssembler.name);

  runPublish(view: RunPublishView): RunPublishView {
    return conformToContract({ schema: RunPublishViewSchema, value: view, view: 'RunPublishView', logger: this.logger, event: CONTRACT_VIOLATED_EVENT });
  }

  attempt(view: PublishAttemptView): PublishAttemptView {
    return conformToContract({
      schema: PublishAttemptViewSchema,
      value: view,
      view: 'PublishAttemptView',
      logger: this.logger,
      event: CONTRACT_VIOLATED_EVENT,
    });
  }
}
