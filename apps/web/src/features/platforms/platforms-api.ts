import {
  ConnectionStartViewSchema,
  GateChangeRequestSchema,
  PlatformViewSchema,
  PlatformsViewSchema,
  apiPaths,
  type ConnectionStartView,
  type GateChangeRequest,
  type PlatformView,
  type PlatformsView,
} from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 rev 7 platform calls (SPEC 0007 section 4.4), through the BFF route table. Every body is
 * checked with its C10 schema before it is sent and every response is parsed with its C10 schema.
 * The OAuth callback is not here: the platform sends the browser straight to the api.
 */
export interface PlatformsApi {
  listPlatforms(): Promise<PlatformsView>;
  /** The owner's gate change; enabling Instagram `publish` answers `platform-publish-unsupported`. */
  changeGate(platform: Platform, request: GateChangeRequest): Promise<PlatformView>;
  /** Where to send the browser; the schema accepts only `https` or the api's loopback callback. */
  startConnection(platform: Platform): Promise<ConnectionStartView>;
  disconnect(platform: Platform): Promise<PlatformView>;
}

export function createPlatformsApi(transport: ApiTransport): PlatformsApi {
  return {
    listPlatforms: () => requestJson(transport, { method: 'GET', path: apiPaths.platforms() }, PlatformsViewSchema),
    changeGate: (platform, request) =>
      requestJson(
        transport,
        { method: 'PATCH', path: apiPaths.platformGate(platform), body: { kind: 'json', value: checkedBody(GateChangeRequestSchema, request) } },
        PlatformViewSchema,
      ),
    startConnection: (platform) =>
      requestJson(transport, { method: 'POST', path: apiPaths.platformConnection(platform) }, ConnectionStartViewSchema),
    disconnect: (platform) => requestJson(transport, { method: 'DELETE', path: apiPaths.platformConnection(platform) }, PlatformViewSchema),
  };
}

/** The platforms client for client components (same-origin BFF). */
export const browserPlatformsApi: PlatformsApi = createPlatformsApi(browserTransport);
