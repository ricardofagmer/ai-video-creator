import { type AssetKind } from '@studio/shared/catalog';
import { type StageId } from '@studio/shared/run-format';

/** One binding slot the editor offers (C2 `BindingSlot`, design/telas/06 "Vínculos"). */
export interface SlotSpec {
  slot: string;
  label: string;
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
  { slot: 'prompt:planner', label: 'Prompt do planejador', kind: 'prompt', optional: true, stage: 'plan' },
  { slot: 'prompt:writer', label: 'Prompt do roteirista', kind: 'prompt', optional: true, stage: 'script' },
  { slot: 'prompt:director', label: 'Prompt do diretor', kind: 'prompt', optional: true, stage: 'scenes' },
  { slot: 'voice', label: 'Voz', kind: 'ai-model', optional: true, stage: 'narration' },
  { slot: 'template', label: 'Template', kind: 'template', optional: false, stage: 'composition' },
  { slot: 'brand-kit', label: 'Kit de marca', kind: 'brand-kit', optional: true, stage: 'composition' },
  { slot: 'music', label: 'Música', kind: 'music', optional: true, stage: 'music' },
  { slot: 'prompt:evaluator', label: 'Prompt do avaliador', kind: 'prompt', optional: true, stage: 'agent-review' },
  { slot: 'prompt:recovery', label: 'Prompt de recuperação', kind: 'prompt', optional: true, stage: null },
];

/** Slots shown for the enabled stages, in stage order. */
export function slotsForStages(enabled: ReadonlySet<StageId>): SlotSpec[] {
  return slotSpecs.filter((spec) => spec.stage === null || enabled.has(spec.stage));
}

export function isKnownSlot(slot: string): boolean {
  return slotSpecs.some((spec) => spec.slot === slot);
}

/** Every kind the editor can bind, for `allowedKinds` (C2) of a new recipe. */
export const editorKinds: readonly AssetKind[] = [...new Set(slotSpecs.map((spec) => spec.kind))];
