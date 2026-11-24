import { WIZARD_STORAGE_KEY, parseDraft, type WizardDraft } from './wizard-draft';

/** The part of `Storage` the wizard uses, so the calls can be checked without a browser. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * `window.sessionStorage`, or null where it cannot be used: on the server, with storage turned
 * off, or when merely reading the property throws (some privacy modes do).
 */
export function sessionDraftStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readDraft(storage: DraftStorage | null): WizardDraft | null {
  if (storage === null) return null;
  try {
    return parseDraft(storage.getItem(WIZARD_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Keeping the draft is a convenience: a full or blocked storage leaves the wizard working without it. */
export function writeDraft(storage: DraftStorage | null, draft: WizardDraft): void {
  if (storage === null) return;
  try {
    storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota or privacy mode: the answers live in memory only until the page closes.
  }
}

export function clearDraft(storage: DraftStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // Nothing to clean when storage cannot be reached.
  }
}
