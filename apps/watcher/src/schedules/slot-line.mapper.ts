import { type RunId } from '@studio/shared/run-format';
import { type SlotLine, type SlotMissedReason, type SlotSkippedReason } from '@studio/shared/schedules';

/*
 * The three shapes of a `slots.jsonl` line (SPEC 0006 section 4.3): `reasonId` is null exactly when
 * the slot fired, and `runId` with `briefId` are set exactly then. Built here only, so every
 * appended line satisfies `SlotLineSchema` by construction.
 */

export interface FiredSlot {
  runId: RunId;
  briefId: string;
}

export function missedSlotLine(slotAt: Date, reasonId: SlotMissedReason, decidedAt: Date): SlotLine {
  return { slotAt: slotAt.toISOString(), decidedAt: decidedAt.toISOString(), result: 'missed', reasonId, runId: null, briefId: null };
}

export function skippedSlotLine(slotAt: Date, reasonId: SlotSkippedReason, decidedAt: Date): SlotLine {
  return { slotAt: slotAt.toISOString(), decidedAt: decidedAt.toISOString(), result: 'skipped', reasonId, runId: null, briefId: null };
}

export function firedSlotLine(slotAt: Date, fired: FiredSlot, decidedAt: Date): SlotLine {
  return {
    slotAt: slotAt.toISOString(),
    decidedAt: decidedAt.toISOString(),
    result: 'fired',
    reasonId: null,
    runId: fired.runId,
    briefId: fired.briefId,
  };
}
