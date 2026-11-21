import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectionStartViewSchema,
  PlatformViewSchema,
  PlatformsViewSchema,
  type ConnectionStartView,
  type PlatformView,
  type PlatformsView,
} from '@studio/shared/api';
import { conformToContract } from '../platform/response-contract';

const CONTRACT_VIOLATED_EVENT = 'platform.response-contract-violated';

/**
 * Answers of the platform routes (SPEC 0007 section 4.4, C10 rev 7). Each core result passes its
 * frozen strict schema before it leaves the api, so no token, code, verifier, client secret or
 * platform account id can reach the web through a contract drift (K3, K7). The authorize URL is
 * the contract's own field: it carries the `state` and the PKCE challenge the platform needs, and
 * the schema admits only `https` or the api's loopback callback.
 */
@Injectable()
export class PlatformResponseAssembler {
  private readonly logger = new Logger(PlatformResponseAssembler.name);

  platforms(view: PlatformsView): PlatformsView {
    return conformToContract({ schema: PlatformsViewSchema, value: view, view: 'PlatformsView', logger: this.logger, event: CONTRACT_VIOLATED_EVENT });
  }

  platform(view: PlatformView): PlatformView {
    return conformToContract({ schema: PlatformViewSchema, value: view, view: 'PlatformView', logger: this.logger, event: CONTRACT_VIOLATED_EVENT });
  }

  connectionStart(view: ConnectionStartView): ConnectionStartView {
    return conformToContract({
      schema: ConnectionStartViewSchema,
      value: view,
      view: 'ConnectionStartView',
      logger: this.logger,
      event: CONTRACT_VIOLATED_EVENT,
    });
  }
}
