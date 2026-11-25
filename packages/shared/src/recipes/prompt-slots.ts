import { type Recipe } from './recipe';
import { type Binding } from './recipe-parts';

const PROMPT_SLOT_PREFIX = 'prompt:';

/**
 * Prompt assets carry no agent field, so the agent is read from the asset id the catalog seeds use
 * (`writer-prompt`, `director-prompt`, `reviewer-prompt`, `recovery-prompt`).
 */
const PROMPT_SLOT_BY_ID_WORD = [
  ['planner', 'prompt:planner'],
  ['writer', 'prompt:writer'],
  ['director', 'prompt:director'],
  ['reviewer', 'prompt:evaluator'],
  ['evaluator', 'prompt:evaluator'],
  ['recovery', 'prompt:recovery'],
] as const;

export type PromptSlot = (typeof PROMPT_SLOT_BY_ID_WORD)[number][1];

/** The prompt slot an asset id names, or null when the id names no agent. */
export function promptSlotOf(ref: string): PromptSlot | null {
  const words = (ref.split('@')[0] ?? '').toLowerCase().split(/[^a-z]+/);
  return PROMPT_SLOT_BY_ID_WORD.find(([word]) => words.includes(word))?.[1] ?? null;
}

function isMisplacedPrompt(binding: Binding): boolean {
  if (!binding.slot.startsWith(PROMPT_SLOT_PREFIX)) return false;
  const named = promptSlotOf(binding.ref);
  return named !== null && named !== binding.slot;
}

/**
 * Bindings with every prompt in the slot of the agent its asset id names. Presets saved before the
 * cart filled prompts by agent hold the Scriptwriter's prompt in the Planner's slot and the
 * director's in the Scriptwriter's; a run reads the slots, so they are put right before it starts.
 * A misplaced prompt moves to its own slot when that slot is free and is dropped when the slot
 * already holds a prompt. Prompts whose id names no agent stay where the owner put them.
 */
function withPromptSlotsCorrected(bindings: readonly Binding[]): Binding[] {
  const kept = bindings.filter((binding) => !isMisplacedPrompt(binding));
  const taken = new Set(kept.map((binding) => binding.slot));
  for (const binding of bindings) {
    if (!isMisplacedPrompt(binding)) continue;
    const slot = promptSlotOf(binding.ref);
    if (slot === null || taken.has(slot)) continue;
    kept.push({ ...binding, slot });
    taken.add(slot);
  }
  return kept;
}

/** `recipe` with its prompt bindings in their agents' slots; the same object when nothing moves. */
export function recipeWithPromptSlotsCorrected(recipe: Recipe): Recipe {
  if (!recipe.bindings.some(isMisplacedPrompt)) return recipe;
  return { ...recipe, bindings: withPromptSlotsCorrected(recipe.bindings) };
}
