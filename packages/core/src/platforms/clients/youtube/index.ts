import { type LivePlatformClientFactory } from '../live-client-factory';
import { createYoutubeLiveClient } from './youtube-live-client';

/**
 * The YouTube live client folder (SPEC 0007 section 9, ticket R4-07). The registry builds the client
 * only when YouTube runs in live mode; mock mode never touches this binding, so it stays offline.
 */
export const youtubeLiveClientFactory: LivePlatformClientFactory | null = createYoutubeLiveClient;
