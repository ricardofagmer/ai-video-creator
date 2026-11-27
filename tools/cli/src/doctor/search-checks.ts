import { GetSearchIndexStatusQuery, type SearchIndexStatus } from '@studio/core/embeddings';
import { cliText } from '../i18n/messages.js';
import { readManifestState, type ManifestState } from '../models/model-manifest.js';
import { type CliSearchContext } from '../nest/cli-context.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { type DoctorCheck } from './doctor-check.js';

/** The label of the search model line, in the active language. */
export function modelCheckLabel(): string {
  return cliText().doctor.labels.model;
}

/** The label of the search index line, in the active language. */
export function indexCheckLabel(): string {
  return cliText().doctor.labels.index;
}

export interface SearchChecks {
  model: DoctorCheck;
  index: DoctorCheck;
}

function absentDetail(manifest: ManifestState): string {
  const text = cliText().doctor.search;
  switch (manifest.status) {
    case 'unpinned':
      return text.absentUnpinned;
    case 'invalid':
      return text.absentInvalid;
    case 'pinned':
      return text.absentPinned(manifest.manifest.modelRef);
  }
}

/**
 * The model line of SPEC 0003 section 7 (`ready`, `absent`, `rejected`). Never `failed`: a missing
 * or refused model leaves search by meaning unavailable and everything else working (B7), so
 * `studio doctor`, and install step 14 with it, keeps exit 0 (R2-AC-27). No path, no checksum.
 */
export function modelCheck(status: SearchIndexStatus, manifest: ManifestState): DoctorCheck {
  const text = cliText().doctor.search;
  const label = modelCheckLabel();
  switch (status.model) {
    case 'ready':
      return { label, status: 'ok', detail: text.ready(status.modelRef ?? text.noModelRef) };
    case 'absent':
      return { label, status: 'warning', detail: absentDetail(manifest) };
    case 'rejected':
      return { label, status: 'warning', detail: text.rejected(status.modelRef ?? text.noModelRef) };
  }
}

/** The index line of SPEC 0003 section 7: `indexed`, `pending` and `stale` counts. */
export function indexCheck(status: SearchIndexStatus): DoctorCheck {
  const text = cliText().doctor.search;
  const counts = text.counts(status.indexed, status.pending, status.stale);
  if (status.pending === 0 && status.stale === 0) return { label: indexCheckLabel(), status: 'ok', detail: `${counts}.` };
  const hint = status.model === 'ready' ? text.embedHint : text.waitHint;
  return { label: indexCheckLabel(), status: 'warning', detail: `${counts}; ${hint}` };
}

/** One status read serves both lines; it verifies (and lazily loads) the local model, never downloads. */
export async function checkSearch(context: CliSearchContext, settings: CliSettings): Promise<SearchChecks> {
  const manifest = await readManifestState(settings);
  const status = await context.queryBus.execute(new GetSearchIndexStatusQuery());
  return { model: modelCheck(status, manifest), index: indexCheck(status) };
}
