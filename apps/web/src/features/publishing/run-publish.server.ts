import 'server-only';
import { type Platform } from '@studio/shared/metrics';
import { RunManifestSchema } from '@studio/shared/run-format';
import { describeApiError } from '@/features/common/api-error-text';
import { loadPlatforms } from '@/features/platforms/platforms.server';
import { serverRunsApi } from '@/features/runs/runs-api.server';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError } from '@/lib/api';
import { serverTransport } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';
import { createPublishingApi } from './publishing-api';
import { type ManifestEgressRead, type RunPublishData, type RunPublishRead } from './run-publish-data';

const noAccountLabels: Readonly<Record<Platform, string | null>> = { youtube: null, instagram: null, tiktok: null };

function isApiFailure(error: unknown): error is ApiRequestError | ApiResponseContractError | ApiUnreachableError {
  return error instanceof ApiRequestError || error instanceof ApiResponseContractError || error instanceof ApiUnreachableError;
}

async function loadPublishView(runId: string): Promise<RunPublishRead> {
  try {
    return { status: 'ready', view: await createPublishingApi(serverTransport('redirect-to-login')).getRunPublish(runId) };
  } catch (error) {
    if (isApiFailure(error)) return { status: 'failed', message: describeApiError(error, (await getI18n()).t) };
    throw error;
  }
}

async function loadAccountLabels(): Promise<Readonly<Record<Platform, string | null>>> {
  const platforms = await loadPlatforms();
  if (platforms.status === 'failed') return noAccountLabels;
  const labels: Record<Platform, string | null> = { ...noAccountLabels };
  for (const view of platforms.platforms) labels[view.platform] = view.accountLabel;
  return labels;
}

async function loadManifestEgress(runId: string): Promise<ManifestEgressRead> {
  try {
    const manifest = await serverRunsApi().readArtifactJson(runId, 'manifest.json', RunManifestSchema);
    return { status: 'ready', entries: manifest.egress };
  } catch (error) {
    if (isApiFailure(error)) return { status: 'unavailable' };
    throw error;
  }
}

/**
 * Everything the publish card and "O que saiu da máquina" show on an approved run's page (SPEC 0007
 * section 5.4), read on the server. Each read fails on its own: the run page always renders.
 */
export async function loadRunPublishData(runId: string): Promise<RunPublishData> {
  const [publish, accountLabels, egress] = await Promise.all([loadPublishView(runId), loadAccountLabels(), loadManifestEgress(runId)]);
  return { publish, accountLabels, egress };
}
