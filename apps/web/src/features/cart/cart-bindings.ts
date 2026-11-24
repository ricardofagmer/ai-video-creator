import { WRITER_SKILLS_MAX } from '@studio/shared/agents';
import { cartConflicts, type CompositionConflict } from '@studio/shared/recipes';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { editorKinds, slotSpecs, type SlotSpec } from '@/features/recipes/recipe-slots';
import { type CartItem } from './cart-store';

export interface CartFill {
  bindings: Record<string, string>;
  /** `skill:writer` refs after the fill: the current ones, then the cart's skills, at most `WRITER_SKILLS_MAX`. */
  writerSkills: string[];
  /** Cart refs now pinned in a slot or as a writer skill. */
  used: string[];
  /** Cart items of a recipe kind that found no slot: not an active version, stage off, or slots full. */
  skipped: CartItem[];
  /** Kinds with one slot the cart holds twice (guided-creation spec section 3): left as they were, for the owner to pick. */
  conflicts: CompositionConflict[];
}

/**
 * Puts cart items into the recipe's slots. A kind with one slot (template, voice, brand kit, music)
 * takes the cart item over what is there, unless the cart holds two active items of that kind: then
 * none of them is pinned and the conflict is returned, instead of the last one silently winning.
 * Prompts fill the empty prompt slots in stage order. Only refs the editor offers (active versions)
 * are pinned, so the saved recipe stays valid.
 */
export function fillSlotsFromCart(
  slots: readonly SlotSpec[],
  cart: readonly CartItem[],
  options: readonly BindingOption[],
  current: Readonly<Record<string, string>>,
  currentSkills: readonly string[],
  scriptEnabled: boolean,
): CartFill {
  const bindings: Record<string, string> = { ...current };
  const conflicts = cartConflicts(cart);
  const conflictRefs = new Set(conflicts.flatMap((conflict) => (conflict.rule === 'duplicate-kind' ? conflict.refs : [])));
  const bindable = cart.filter(
    (item) => !conflictRefs.has(item.ref) && options.some((option) => option.ref === item.ref && option.kind === item.kind),
  );
  const used: string[] = [];
  for (const spec of slots) {
    const sameKindSlots = slots.filter((candidate) => candidate.kind === spec.kind).length;
    const replace = sameKindSlots === 1;
    if (!replace && (bindings[spec.slot] ?? '') !== '') continue;
    const next = bindable.find((item) => item.kind === spec.kind && !used.includes(item.ref));
    if (next === undefined) continue;
    bindings[spec.slot] = next.ref;
    used.push(next.ref);
  }
  const writerSkills = [...currentSkills];
  if (scriptEnabled) {
    for (const item of bindable) {
      if (item.kind !== 'skill' || item.sensitivity === 'biometric' || writerSkills.length >= WRITER_SKILLS_MAX) continue;
      if (!writerSkills.includes(item.ref)) writerSkills.push(item.ref);
      used.push(item.ref);
    }
  }
  // Conflicting items are reported as conflicts, not as "found no slot".
  const skipped = cart.filter((item) => !used.includes(item.ref) && !conflictRefs.has(item.ref) && editorKinds.includes(item.kind));
  return { bindings, writerSkills, used, skipped, conflicts };
}

/** Where checkout says a cart item goes; the recipe editor applies the same rules against the live catalog. */
export type CartDestination = 'slot' | 'writer-skill' | 'reference' | 'unused';

const slotKinds = new Set(slotSpecs.map((spec) => spec.kind));

/**
 * Checkout preview of each item's destination, in cart order. Active slot kinds pin a slot; active
 * or draft non-biometric skills become writer skills (the first `WRITER_SKILLS_MAX`); everything else rides
 * along as a run reference, except biometric rows, which are never sent as references.
 */
export function cartDestinations(cart: readonly CartItem[]): Map<string, CartDestination> {
  const destinations = new Map<string, CartDestination>();
  let skills = 0;
  for (const item of cart) {
    const active = item.status === 'active';
    const biometric = item.sensitivity === 'biometric';
    if (active && slotKinds.has(item.kind)) destinations.set(item.ref, 'slot');
    else if ((active || item.status === 'draft') && item.kind === 'skill' && !biometric && skills < WRITER_SKILLS_MAX) {
      skills += 1;
      destinations.set(item.ref, 'writer-skill');
    } else destinations.set(item.ref, biometric ? 'unused' : 'reference');
  }
  return destinations;
}

/** Cart items a run can take as references: everything not pinned in the recipe, never biometric. */
export function runReferencesFromCart(cart: readonly CartItem[], pinnedRefs: ReadonlySet<string>): string[] {
  return cart.filter((item) => item.sensitivity !== 'biometric' && !pinnedRefs.has(item.ref)).map((item) => item.ref);
}
