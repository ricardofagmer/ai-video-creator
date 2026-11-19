import { GetSearchIndexStatusQuery, type SearchIndexStatus } from '@studio/core/embeddings';
import { readManifestState, type ManifestState } from '../models/model-manifest.js';
import { type CliSearchContext } from '../nest/cli-context.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { type DoctorCheck } from './doctor-check.js';

export const MODEL_CHECK_LABEL = 'modelo de busca';
export const INDEX_CHECK_LABEL = 'índice de busca';

export interface SearchChecks {
  model: DoctorCheck;
  index: DoctorCheck;
}

function absentDetail(manifest: ManifestState): string {
  switch (manifest.status) {
    case 'unpinned':
      return 'ausente; o manifesto em scripts/models ainda é provisório, então nada foi baixado. A busca por significado fica indisponível; o resto do studio funciona.';
    case 'invalid':
      return 'ausente; o manifesto em scripts/models não pode ser usado (veja "studio models status").';
    case 'pinned':
      return `ausente (${manifest.manifest.modelRef}); rode "studio models fetch" quando a rede estiver disponível.`;
  }
}

/**
 * The model line of SPEC 0003 section 7 (`ready`, `absent`, `rejected`). Never `failed`: a missing
 * or refused model leaves search by meaning unavailable and everything else working (B7), so
 * `studio doctor`, and install step 14 with it, keeps exit 0 (R2-AC-27). No path, no checksum.
 */
export function modelCheck(status: SearchIndexStatus, manifest: ManifestState): DoctorCheck {
  switch (status.model) {
    case 'ready':
      return { label: MODEL_CHECK_LABEL, status: 'ok', detail: `pronto (${status.modelRef ?? 'sem modelRef'}).` };
    case 'absent':
      return { label: MODEL_CHECK_LABEL, status: 'warning', detail: absentDetail(manifest) };
    case 'rejected':
      return {
        label: MODEL_CHECK_LABEL,
        status: 'warning',
        detail: `recusado (${status.modelRef ?? 'sem modelRef'}): os arquivos não conferem com o manifesto ou o runtime não os carregou. Rode "studio models verify" e depois "studio models fetch".`,
      };
  }
}

/** The index line of SPEC 0003 section 7: `indexed`, `pending` and `stale` counts. */
export function indexCheck(status: SearchIndexStatus): DoctorCheck {
  const counts = `${status.indexed} indexada(s), ${status.pending} pendente(s), ${status.stale} desatualizada(s)`;
  if (status.pending === 0 && status.stale === 0) return { label: INDEX_CHECK_LABEL, status: 'ok', detail: `${counts}.` };
  const hint =
    status.model === 'ready'
      ? 'rode "studio catalog embed" (ou --stale) para indexar.'
      : 'a indexação espera o modelo de busca ficar pronto.';
  return { label: INDEX_CHECK_LABEL, status: 'warning', detail: `${counts}; ${hint}` };
}

/** One status read serves both lines; it verifies (and lazily loads) the local model, never downloads. */
export async function checkSearch(context: CliSearchContext, settings: CliSettings): Promise<SearchChecks> {
  const manifest = await readManifestState(settings);
  const status = await context.queryBus.execute(new GetSearchIndexStatusQuery());
  return { model: modelCheck(status, manifest), index: indexCheck(status) };
}
