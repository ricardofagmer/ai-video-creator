import 'server-only';
import { type CurationView, type RecipeVersionView } from '@studio/shared/api';
import { CurationIdSchema, type CurationSubject } from '@studio/shared/curation';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError, isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { describeApiError } from '@/features/common/api-error-text';
import { recipeIdOf } from '@/features/comparisons/comparison-labels';
import { assetSubjectArmOptions, type CompareArmOption } from './curation-compare-model';
import { subjectAssetId } from './curation-labels';
import { serverCurationsApi } from './curations-api.server';

const SUBJECT_LIST_LIMIT = 20;

export type CompareOptions = { status: 'ready'; options: readonly CompareArmOption[] } | { status: 'failed'; message: string };

function isApiFailure(error: unknown): error is ApiRequestError | ApiResponseContractError | ApiUnreachableError {
  return error instanceof ApiRequestError || error instanceof ApiResponseContractError || error instanceof ApiUnreachableError;
}

export type SubjectCurations = { status: 'ready'; items: readonly CurationView[] } | { status: 'failed'; message: string };

/**
 * The curations of one version, newest first. Asset and recipe refs share a shape (SPEC 0005 L7),
 * so the answer is narrowed to the subject's kind as well. A failed read is shown on the version
 * page instead of failing the whole page; a session redirect still propagates.
 */
export async function loadSubjectCurations(subject: CurationSubject): Promise<SubjectCurations> {
  try {
    const page = await serverCurationsApi().listCurations({ subjectRef: subject.ref, limit: SUBJECT_LIST_LIMIT });
    return { status: 'ready', items: page.items.filter((curation) => curation.subject.kind === subject.kind) };
  } catch (error) {
    if (isApiFailure(error)) return { status: 'failed', message: describeApiError(error) };
    throw error;
  }
}

/** `GET /curations/:id`, or null when the id is malformed or unknown. */
export async function loadCuration(curationId: string): Promise<CurationView | null> {
  if (!CurationIdSchema.safeParse(curationId).success) return null;
  try {
    return await serverCurationsApi().getCuration(curationId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Draft and active versions both run; a deprecated version cannot start a run. */
async function loadRunnableRecipes(): Promise<RecipeVersionView[]> {
  const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
  return [...page.items].sort(
    (left, right) => left.recipe.name.localeCompare(right.recipe.name, 'pt-BR') || right.recipe.version - left.recipe.version,
  );
}

/**
 * Arm A choices for "Comparar" (SPEC 0005 section 5.7): for a recipe subject the subject version
 * itself; for a prompt or skill, the runnable recipes that bind the subject's asset.
 */
export async function loadCompareOptions(subject: CurationSubject): Promise<CompareOptions> {
  try {
    if (subject.kind === 'recipe') {
      const parsed = recipeIdOf(subject.ref);
      if (parsed === null) return { status: 'ready', options: [] };
      const recipe = await serverStudioClient().getRecipeVersion(parsed.recipeId, parsed.version);
      return { status: 'ready', options: [{ recipe, slots: [] }] };
    }
    const assetId = subjectAssetId(subject);
    if (assetId === null) return { status: 'ready', options: [] };
    return { status: 'ready', options: assetSubjectArmOptions(await loadRunnableRecipes(), assetId) };
  } catch (error) {
    if (isApiFailure(error)) return { status: 'failed', message: describeApiError(error) };
    throw error;
  }
}
