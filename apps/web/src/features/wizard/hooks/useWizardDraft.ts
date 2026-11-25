'use client';

import { useCallback, useEffect, useState } from 'react';
import { runReferencesFromCart } from '@/features/cart/cart-bindings';
import { cartActions } from '@/features/cart/cart-store';
import { draftForRecipes, emptyDraft, type WizardDraft } from '../wizard-draft';
import { clearDraft, readDraft, sessionDraftStorage, writeDraft } from '../wizard-storage';

/** C10 `CreateRunRequest.references` holds at most 50 refs. */
const MAX_REFERENCES = 50;

export interface WizardDraftState {
  draft: WizardDraft;
  update: (change: (draft: WizardDraft) => WizardDraft) => void;
  /** The answers came back from sessionStorage after a reload. */
  restored: boolean;
  /** Cart items preselected as references on a fresh start (spec section 5, step 1). */
  cartReferencesAdded: number;
  /** Forgets every answer and starts at the idea step again. */
  reset: () => void;
}

/**
 * The draft of steps 0 to 4, kept in sessionStorage under `studio.wizard.v1`. The first render
 * is the empty draft on the server and in the browser alike (no hydration mismatch); the stored
 * draft is read once after mounting. Without storage the wizard works from memory only.
 */
export function useWizardDraft(runnableRefs: readonly string[]): WizardDraftState {
  const [draft, setDraft] = useState<WizardDraft>(() => emptyDraft(''));
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [cartReferencesAdded, setCartReferencesAdded] = useState(0);

  useEffect(() => {
    const stored = readDraft(sessionDraftStorage());
    // Biometric items never become references; recipe pins are chosen later, in step 3.
    const fromCart = runReferencesFromCart(cartActions.snapshot(), new Set());
    if (stored !== null) {
      // A restored draft still takes what the cart holds now, or an image added to the cart after
      // the draft was started would never reach the run.
      const restoredDraft = draftForRecipes(stored, runnableRefs);
      const added = fromCart.filter((ref) => !restoredDraft.references.includes(ref)).slice(0, Math.max(0, MAX_REFERENCES - restoredDraft.references.length));
      setDraft(added.length === 0 ? restoredDraft : { ...restoredDraft, references: [...restoredDraft.references, ...added] });
      setCartReferencesAdded(added.length);
      setRestored(true);
    } else if (fromCart.length > 0) {
      const references = fromCart.slice(0, MAX_REFERENCES);
      setDraft((current) => ({ ...current, references }));
      setCartReferencesAdded(references.length);
    }
    setLoaded(true);
    // Read once on arrival; later changes of the recipe list come with a new page load.
  }, []);

  useEffect(() => {
    if (loaded) writeDraft(sessionDraftStorage(), draft);
  }, [draft, loaded]);

  const update = useCallback((change: (current: WizardDraft) => WizardDraft) => setDraft(change), []);

  const reset = useCallback(() => {
    clearDraft(sessionDraftStorage());
    setDraft(emptyDraft(''));
    setRestored(false);
    setCartReferencesAdded(0);
  }, []);

  return { draft, update, restored, cartReferencesAdded, reset };
}
