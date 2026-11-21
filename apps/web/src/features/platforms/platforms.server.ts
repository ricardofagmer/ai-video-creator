import 'server-only';
import { type PlatformView } from '@studio/shared/api';
import { describeApiError } from '@/features/common/api-error-text';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';
import { serverTransport } from '@/lib/api/server';
import { createPlatformsApi } from './platforms-api';

export type PlatformsData = { status: 'ready'; platforms: readonly PlatformView[] } | { status: 'failed'; message: string };

function isApiFailure(error: unknown): error is ApiRequestError | ApiResponseContractError | ApiUnreachableError {
  return error instanceof ApiRequestError || error instanceof ApiResponseContractError || error instanceof ApiUnreachableError;
}

/**
 * `GET /platforms` for `/contas` and the publish dialog. A failed read is shown where the platforms
 * would be instead of failing the page; a session redirect still propagates.
 */
export async function loadPlatforms(): Promise<PlatformsData> {
  try {
    const view = await createPlatformsApi(serverTransport('redirect-to-login')).listPlatforms();
    return { status: 'ready', platforms: view.platforms };
  } catch (error) {
    if (isApiFailure(error)) return { status: 'failed', message: describeApiError(error) };
    throw error;
  }
}
