import { IsoDateSchema } from '@studio/shared/metrics';
import { type Brief, type Recipe } from '@studio/shared/recipes';
import { resolveLimits } from '@studio/shared/run-format';
import { IanaTimeZoneSchema, LocalTimeSchema, nextSlots, scheduleBounds, type Recurrence } from '@studio/shared/schedules';

/*
 * The "Novo agendamento" dialog (SPEC 0006 sections 5.5 and 5.7): values typed by the owner, the C10
 * `Recurrence` built from them, and the two worst-case cost figures the owner consents to. The api
 * validates every field again and recomputes the per-run figure (409 `schedule-estimate-changed`).
 */

export type RecurrenceKind = Recurrence['kind'];

export interface ScheduleFormValues {
  title: string;
  recipeRef: string;
  kind: RecurrenceKind;
  /** `HH:MM`, local to `timezone`. */
  time: string;
  /** `yyyy-mm-dd`, for `once` only. */
  date: string;
  /** ISO weekdays, for `weekly` only. */
  weekdays: readonly number[];
  /** 1 to 28, for `monthly` only. */
  dayOfMonth: string;
  timezone: string;
}

/** One brief waiting in the dialog's queue; `key` only tells list items apart on screen. */
export interface QueuedBrief {
  key: string;
  title: string | null;
  brief: Brief;
}

export type ScheduleField = 'title' | 'recipeRef' | 'kind' | 'time' | 'date' | 'weekdays' | 'dayOfMonth' | 'timezone' | 'briefs' | 'consent';

export type ScheduleErrors = Partial<Record<ScheduleField, string>>;

export const scheduleFieldIds: Readonly<Record<ScheduleField, string>> = {
  title: 'agendamento-titulo',
  recipeRef: 'agendamento-receita',
  kind: 'agendamento-repeticao',
  time: 'agendamento-hora',
  date: 'agendamento-data',
  weekdays: 'agendamento-dia-1',
  dayOfMonth: 'agendamento-dia-do-mes',
  timezone: 'agendamento-fuso',
  briefs: 'agendamento-briefings',
  consent: 'agendamento-consentimento',
};

export const scheduleFieldOrder: readonly ScheduleField[] = [
  'title',
  'recipeRef',
  'kind',
  'date',
  'weekdays',
  'dayOfMonth',
  'time',
  'timezone',
  'briefs',
  'consent',
];

export const recurrenceKindOptions: readonly { value: RecurrenceKind; label: string }[] = [
  { value: 'daily', label: 'Todo dia' },
  { value: 'weekly', label: 'Toda semana' },
  { value: 'monthly', label: 'Todo mês' },
  { value: 'once', label: 'Uma vez' },
];

export function initialScheduleValues(options: { recipeRef: string; today: string; timezone: string }): ScheduleFormValues {
  return {
    title: '',
    recipeRef: options.recipeRef,
    kind: 'daily',
    time: '09:00',
    date: options.today,
    weekdays: [1],
    dayOfMonth: '1',
    timezone: options.timezone,
  };
}

export type RecurrenceResult = { kind: 'valid'; recurrence: Recurrence; timezone: string } | { kind: 'invalid'; errors: ScheduleErrors };

/** The C10 `Recurrence` and zone, or the inline errors; a `once` slot must be in the future. */
export function buildRecurrence(values: ScheduleFormValues, now: Date): RecurrenceResult {
  const errors: ScheduleErrors = {};
  if (!LocalTimeSchema.safeParse(values.time).success) errors.time = 'Escolha a hora (HH:MM).';
  if (!IanaTimeZoneSchema.safeParse(values.timezone).success) errors.timezone = 'Escolha um fuso horário da lista.';
  let recurrence: Recurrence | null = null;
  switch (values.kind) {
    case 'once':
      if (!IsoDateSchema.safeParse(values.date).success) errors.date = 'Escolha a data.';
      else recurrence = { kind: 'once', date: values.date, time: values.time };
      break;
    case 'daily':
      recurrence = { kind: 'daily', time: values.time };
      break;
    case 'weekly':
      if (values.weekdays.length === 0) errors.weekdays = 'Marque pelo menos um dia da semana.';
      else recurrence = { kind: 'weekly', weekdays: [...values.weekdays].sort((left, right) => left - right), time: values.time };
      break;
    case 'monthly': {
      const day = /^[0-9]{1,2}$/.test(values.dayOfMonth) ? Number.parseInt(values.dayOfMonth, 10) : Number.NaN;
      if (!(day >= 1 && day <= 28)) errors.dayOfMonth = 'Escolha um dia entre 1 e 28.';
      else recurrence = { kind: 'monthly', dayOfMonth: day, time: values.time };
      break;
    }
  }
  if (recurrence === null || Object.keys(errors).length > 0) return { kind: 'invalid', errors };
  if (recurrence.kind === 'once' && nextSlots({ recurrence, timezone: values.timezone, after: now, count: 1 }).length === 0) {
    return { kind: 'invalid', errors: { date: 'A data e a hora precisam estar no futuro.' } };
  }
  return { kind: 'valid', recurrence, timezone: values.timezone };
}

const WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

export interface CostFigures {
  /** The pinned recipe's resolved `costPerRunUsd`: what `acceptedWorstCasePerRunUsd` must equal. */
  perRunUsd: number;
  /** The recipe's resolved `costPerMonthUsd`, checked again at every slot and every `preflight`. */
  monthCeilingUsd: number;
  /** Slots in the next 31 days; null while the recurrence is incomplete. */
  slotsNext31Days: number | null;
  /** `slotsNext31Days * perRunUsd` (section 5.5 step 4); null while the recurrence is incomplete. */
  worstCasePerMonthUsd: number | null;
}

/** Both worst-case figures of the create dialog, from the same `nextSlots` the api and watcher use. */
export function costFigures(recipe: Recipe, recurrence: RecurrenceResult, now: Date): CostFigures {
  const limits = resolveLimits(recipe.limits);
  if (recurrence.kind === 'invalid') {
    return { perRunUsd: limits.costPerRunUsd, monthCeilingUsd: limits.costPerMonthUsd, slotsNext31Days: null, worstCasePerMonthUsd: null };
  }
  // Daily is the finest recurrence, so 31 days hold at most 31 slots; one more proves the window is full.
  const slots = nextSlots({ recurrence: recurrence.recurrence, timezone: recurrence.timezone, after: now, count: 32 });
  const inWindow = slots.filter((slot) => slot.getTime() - now.getTime() <= WINDOW_MS).length;
  return {
    perRunUsd: limits.costPerRunUsd,
    monthCeilingUsd: limits.costPerMonthUsd,
    slotsNext31Days: inWindow,
    worstCasePerMonthUsd: inWindow * limits.costPerRunUsd,
  };
}

/** The title rule of `CreateScheduleRequestSchema`, with a pt-BR message. */
export function titleError(title: string): string | undefined {
  const trimmed = title.trim();
  if (trimmed === '') return 'Dê um nome ao agendamento.';
  if (trimmed.length > scheduleBounds.titleChars) return `Use até ${scheduleBounds.titleChars} caracteres.`;
  return undefined;
}

/** The runtime's IANA zones for the zone select, read once per dialog. */
export function timeZoneOptions(current: string): readonly { value: string; label: string }[] {
  const zones = Intl.supportedValuesOf('timeZone');
  const list = zones.includes(current) ? zones : [current, ...zones];
  return list.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}
