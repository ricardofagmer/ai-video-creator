import { type LivePlatformClientFactory } from '../live-client-factory';
import { InstagramLiveClient } from './instagram-live-client';

/**
 * The Instagram live client folder (SPEC 0007 section 9, ticket R4-08): Instagram Login, metrics
 * only (OD8). The registry builds it once, in live mode only, with the injected `fetch`; mock mode
 * never reaches it.
 */
export const instagramLiveClientFactory: LivePlatformClientFactory | null = (context) => new InstagramLiveClient(context);
