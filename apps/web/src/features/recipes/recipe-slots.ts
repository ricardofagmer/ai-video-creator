import { type AssetKind } from '@studio/shared/catalog';
import { type StageId } from '@studio/shared/run-format';

/** The slots the editor knows; their labels live in `t.recipes.bindings.slots`. */
export type SlotId =
  | 'prompt:planner'
  | 'prompt:writer'
  | 'prompt:director'
  | 'voice'
  | 'template'
  | 'brand-kit'
  | 'music'
  | 'prompt:evaluator'
  | 'prompt:recovery';

/** One binding slot the editor offers (C2 `BindingSlot`, design/telas/06 "Vínculos"). */
export interface SlotSpec {
  slot: SlotId;
  kind: AssetKind;
  optional: boolean;
  /** Stage that needs the slot; null for slots every recipe may pin (the recovery prompt). */
  stage: StageId | null;
}

/**
 * Slots per stage. Agent prompts follow the topology roles (planner, writer, director, evaluator,
 * recovery); an unbound prompt slot keeps the agent's built-in prompt, so only the template is
 * required when composition runs.
 */
export const slotSpecs: readonly SlotSpec[] = [
  { slot: 'prompt:planner', kind: 'prompt', optional: true, stage: 'plan' },
  { slot: 'prompt:writer', kind: 'prompt', optional: true, stage: 'script' },
  { slot: 'prompt:director', kind: 'prompt', optional: true, stage: 'scenes' },
  { slot: 'voice', kind: 'ai-model', optional: true, stage: 'narration' },
  { slot: 'template', kind: 'template', optional: false, stage: 'composition' },
  { slot: 'brand-kit', kind: 'brand-kit', optional: true, stage: 'composition' },
  { slot: 'music', kind: 'music', optional: true, stage: 'music' },
  { slot: 'prompt:evaluator', kind: 'prompt', optional: true, stage: 'agent-review' },
  { slot: 'prompt:recovery', kind: 'prompt', optional: true, stage: null },
];

/** Slots shown for the enabled stages, in stage order. */
export function slotsForStages(enabled: ReadonlySet<StageId>): SlotSpec[] {
  return slotSpecs.filter((spec) => spec.stage === null || enabled.has(spec.stage));
}

export function isKnownSlot(slot: string): boolean {
  return slotSpecs.some((spec) => spec.slot === slot);
}

/** The repeatable slot of the Scriptwriter's skills: one binding per skill, each sent as its own block. */
export const WRITER_SKILL_SLOT = 'skill:writer';

/** Every kind the editor can bind, for `allowedKinds` (C2) of a new recipe; skills go to `skill:writer`. */
export const editorKinds: readonly AssetKind[] = [...new Set<AssetKind>([...slotSpecs.map((spec) => spec.kind), 'skill'])];
