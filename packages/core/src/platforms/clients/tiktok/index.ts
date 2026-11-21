import { type LivePlatformClientFactory } from '../live-client-factory';
import { TiktokPlatformClient } from './tiktok-platform-client';

/**
 * The TikTok live client folder (SPEC 0007 section 9, ticket R4-09). The registry builds the client
 * once, in live mode only, with Node's global `fetch` (K9); mock mode never reaches this factory.
 */
export const tiktokLiveClientFactory: LivePlatformClientFactory | null = (context) => new TiktokPlatformClient({ context });
