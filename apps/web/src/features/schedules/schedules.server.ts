import 'server-only';
import { type RecipeVersionView, type ScheduleListView, type ScheduleView } from '@studio/shared/api';
import { ScheduleIdSchema } from '@studio/shared/schedules';
import { ApiRequestError, ApiResponseContractError, ApiUnreachableError, isNotFound } from '@/lib/api';
import { serverStudioClient, serverTransport } from '@/lib/api/server';
import { describeApiError } from '@/features/common/api-error-text';
import { getI18n } from '@/lib/i18n/server';
import { createSchedulesApi, type SchedulesApi } from './schedules-api';

function serverSchedulesApi(): SchedulesApi {
  return createSchedulesApi(serverTransport('redirect-to-login'));
}

function isApiFailure(error: unknown): error is ApiRequestError | ApiResponseContractError | ApiUnreachableError {
  return error instanceof ApiRequestError || error instanceof ApiResponseContractError || error instanceof ApiUnreachableError;
}

export type ScheduleList = { status: 'ready'; schedules: ScheduleListView } | { status: 'failed'; message: string };

/** `GET /schedules` (never `deleted`); a failed read is shown on the page, a session redirect propagates. */
export async function loadSchedules(): Promise<ScheduleList> {
  try {
    return { status: 'ready', schedules: await serverSchedulesApi().listSchedules() };
  } catch (error) {
    if (isApiFailure(error)) {
      const { t } = await getI18n();
      return { status: 'failed', message: describeApiError(error, t) };
    }
    throw error;
  }
}

/** `GET /schedules/:id`, or null when the id is malformed or unknown. */
export async function loadSchedule(scheduleId: string): Promise<ScheduleView | null> {
  if (!ScheduleIdSchema.safeParse(scheduleId).success) return null;
  try {
    return await serverSchedulesApi().getSchedule(scheduleId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The title for "Criada pelo agendamento {título}" on a fired run's page; null when the schedule
 * cannot be read, so the run page still renders and says "Criada por um agendamento".
 */
export async function loadScheduleTitle(scheduleId: string): Promise<string | null> {
  if (!ScheduleIdSchema.safeParse(scheduleId).success) return null;
  try {
    return (await serverSchedulesApi().getSchedule(scheduleId)).title;
  } catch (error) {
    if (isApiFailure(error)) return null;
    throw error;
  }
}

export type RunnableRecipes = { status: 'ready'; recipes: readonly RecipeVersionView[] } | { status: 'failed'; message: string };

/**
 * Recipe versions a schedule may pin: draft and active run (core `RUNNABLE_RECIPE_STATUSES`), a
 * deprecated version does not. The api checks again at creation and at every slot.
 */
export async function loadRunnableRecipes(): Promise<RunnableRecipes> {
  try {
    const { locale } = await getI18n();
    const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
    const recipes = [...page.items].sort(
      (left, right) => left.recipe.name.localeCompare(right.recipe.name, locale) || right.recipe.version - left.recipe.version,
    );
    return { status: 'ready', recipes };
  } catch (error) {
    if (isApiFailure(error)) {
      const { t } = await getI18n();
      return { status: 'failed', message: describeApiError(error, t) };
    }
    throw error;
  }
}
