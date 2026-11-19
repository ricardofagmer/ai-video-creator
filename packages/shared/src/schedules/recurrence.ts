import { z } from 'zod';
import { IsoDateSchema } from '../common/ids';

/** A local wall-clock time `HH:MM`, 24-hour (SPEC 0006 section 4.3). */
export const LocalTimeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'expected a local time HH:MM');
export type LocalTime = z.infer<typeof LocalTimeSchema>;

let knownTimeZones: ReadonlySet<string> | null = null;

/** The runtime's IANA zones, read once; `Intl` is available in Node and in browsers (K9). */
function supportedTimeZones(): ReadonlySet<string> {
  if (knownTimeZones === null) knownTimeZones = new Set(Intl.supportedValuesOf('timeZone'));
  return knownTimeZones;
}

/**
 * An IANA time zone known to the runtime (`Intl.supportedValuesOf('timeZone')`), e.g.
 * `America/Sao_Paulo`. The shape check runs first so arbitrary text never reaches `Intl`.
 */
export const IanaTimeZoneSchema = z
  .string()
  .regex(/^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+){0,2}$/, 'expected an IANA time zone name')
  .max(64)
  .refine((zone) => supportedTimeZones().has(zone), { message: 'time zone is not known to this runtime' });
export type IanaTimeZone = z.infer<typeof IanaTimeZoneSchema>;

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const IsoWeekdaySchema = z.number().int().min(1).max(7);

/**
 * When a schedule's slots fall, as local wall-clock times in its `timezone` (section 5.5). The
 * finest recurrence is daily; `monthly` allows days 1 to 28 only, so every month has the slot.
 */
export const RecurrenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), date: IsoDateSchema, time: LocalTimeSchema }).strict(),
  z.object({ kind: z.literal('daily'), time: LocalTimeSchema }).strict(),
  z.object({ kind: z.literal('weekly'), weekdays: z.array(IsoWeekdaySchema).min(1).max(7), time: LocalTimeSchema }).strict(),
  z.object({ kind: z.literal('monthly'), dayOfMonth: z.number().int().min(1).max(28), time: LocalTimeSchema }).strict(),
]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;
