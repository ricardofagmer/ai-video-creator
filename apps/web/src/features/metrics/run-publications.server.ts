import 'server-only';
import { type RunPublicationsView } from '@studio/shared/api';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';
import { describeApiError } from '@/features/common/api-error-text';
import { getI18n } from '@/lib/i18n/server';
import { serverMetricsApi } from './metrics-api.server';

export type RunPublicationsData = { status: 'ready'; view: RunPublicationsView } | { status: 'failed'; message: string };

function isApiFailure(error: unknown): error is ApiRequestError | ApiResponseContractError | ApiUnreachableError {
  return error instanceof ApiRequestError || error instanceof ApiResponseContractError || error instanceof ApiUnreachableError;
}

/**
 * `GET /runs/:runId/publications` for the run page. A failed read is shown inside the
 * "Publicações" card instead of failing the whole run page; a session redirect still propagates.
 */
export async function loadRunPublications(runId: string): Promise<RunPublicationsData> {
  try {
    return { status: 'ready', view: await serverMetricsApi().listRunPublications(runId) };
  } catch (error) {
    if (isApiFailure(error)) {
      const { t } = await getI18n();
      return { status: 'failed', message: describeApiError(error, t) };
    }
    throw error;
  }
}
