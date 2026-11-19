import 'server-only';
import { type SearchIndexStatusResponse } from '@studio/shared/api';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';
import { serverTransport } from '@/lib/api/server';
import { createSemanticSearchApi } from './semantic-search-api';

/**
 * `GET /catalog/search/status` for the catalog page, or null when it could not be read: the page
 * then says so and the lexical catalog keeps working (section 5.2, "the catalog works as in R1").
 */
export async function loadSearchIndexStatus(): Promise<SearchIndexStatusResponse | null> {
  try {
    return await createSemanticSearchApi(serverTransport('redirect-to-login')).indexStatus();
  } catch (error) {
    const unreadable = error instanceof ApiRequestError || error instanceof ApiResponseContractError || error instanceof ApiUnreachableError;
    if (unreadable) return null;
    throw error;
  }
}
