'use client';

import { Checkbox, FormField, Input, Select } from '@studio/ui';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import {
  recurrenceKinds,
  scheduleFieldIds,
  type RecurrenceKind,
  type ScheduleErrors,
  type ScheduleFormValues,
} from '../schedule-form-model';
import styles from '../schedules.module.css';

interface ScheduleRecurrenceFieldsProps {
  values: ScheduleFormValues;
  errors: ScheduleErrors;
  disabled: boolean;
  zoneOptions: readonly { value: string; label: string }[];
  onChange: (patch: Partial<ScheduleFormValues>) => void;
}

/** ISO weekdays, Monday first. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const dayOfMonthOptions = Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));

function isRecurrenceKind(value: string): value is RecurrenceKind {
  return recurrenceKinds.some((kind) => kind === value);
}

/**
 * "Quando" of the create dialog (SPEC 0006 section 4.3 `Recurrence`): once, daily, weekly on chosen
 * weekdays, or monthly on day 1 to 28 (so every month has the slot), at a local time in an IANA
 * zone. The finest recurrence is daily.
 */
export function ScheduleRecurrenceFields({ values, errors, disabled, zoneOptions, onChange }: ScheduleRecurrenceFieldsProps): ReactElement {
  const schedules = useWebMessages().schedules;
  const texts = schedules.recurrenceFields;
  const kindOptions = recurrenceKinds.map((kind) => ({ value: kind, label: schedules.recurrence.kinds[kind] }));
  function toggleWeekday(day: number, checked: boolean): void {
    const next = checked ? [...values.weekdays.filter((value) => value !== day), day] : values.weekdays.filter((value) => value !== day);
    onChange({ weekdays: next });
  }

  return (
    <div className={layout.fieldGrid}>
      <FormField id={scheduleFieldIds.kind} label={texts.kind} error={errors.kind} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Select
            {...control}
            invalid={invalid}
            options={kindOptions}
            value={values.kind}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isRecurrenceKind(value)) onChange({ kind: value });
            }}
          />
        )}
      </FormField>
      {values.kind === 'once' && (
        <FormField id={scheduleFieldIds.date} label={texts.date} error={errors.date} disabled={disabled}>
          {({ invalid, ...control }) => (
            <Input {...control} type="date" invalid={invalid} value={values.date} onChange={(event) => onChange({ date: event.currentTarget.value })} />
          )}
        </FormField>
      )}
      {values.kind === 'monthly' && (
        <FormField id={scheduleFieldIds.dayOfMonth} label={texts.dayOfMonth} help={texts.dayOfMonthHelp} error={errors.dayOfMonth} disabled={disabled}>
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              options={dayOfMonthOptions}
              value={values.dayOfMonth}
              onChange={(event) => onChange({ dayOfMonth: event.currentTarget.value })}
            />
          )}
        </FormField>
      )}
      <FormField id={scheduleFieldIds.time} label={texts.time} error={errors.time} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Input {...control} type="time" step={60} invalid={invalid} value={values.time} onChange={(event) => onChange({ time: event.currentTarget.value })} />
        )}
      </FormField>
      <FormField id={scheduleFieldIds.timezone} label={texts.timezone} error={errors.timezone} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Select
            {...control}
            invalid={invalid}
            options={zoneOptions}
            value={values.timezone}
            onChange={(event) => onChange({ timezone: event.currentTarget.value })}
          />
        )}
      </FormField>
      {values.kind === 'weekly' && (
        <fieldset className={`${layout.fieldset} ${layout.fieldWide}`} disabled={disabled} aria-describedby={errors.weekdays === undefined ? undefined : 'agendamento-dias-erro'}>
          <legend className="label">{texts.weekdays}</legend>
          <div className={styles.weekdays}>
            {WEEKDAYS.map((day) => (
              <Checkbox
                key={day}
                id={`agendamento-dia-${day}`}
                label={schedules.weekdays[day]}
                checked={values.weekdays.includes(day)}
                invalid={errors.weekdays !== undefined}
                onChange={(event) => toggleWeekday(day, event.currentTarget.checked)}
              />
            ))}
          </div>
          {errors.weekdays !== undefined && (
            <p id="agendamento-dias-erro" className={layout.fieldError}>
              {errors.weekdays}
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}
