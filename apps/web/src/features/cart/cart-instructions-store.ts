'use client';

import { BRIEF_INSTRUCTIONS_MAX } from '@studio/shared/recipes';
import { useSyncExternalStore } from 'react';
import { CART_SOURCE_URL_MAX } from './cart-source-url';

/**
 * What the owner writes at cart checkout: instructions for the AI
 * (docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md) and the site for the AI to
 * analyse (docs/specs/2026-11-23-site-analysis-design.md). Kept beside the cart, not in it, so the
 * cart's item format stays `studio.cart.v1`; the new run form reads both on `?carrinho=1`.
 */
const INSTRUCTIONS_KEY = 'studio.cart.instructions.v1';
const SOURCE_URL_KEY = 'studio.cart.source-url.v1';

interface StoredText {
  /** null when nothing is stored. */
  read(): string | null;
  write(value: string | null): void;
  subscribe(listener: () => void): () => void;
}

/** One browser-storage text, cut to `maxLength`, shared by every hook on the page and by other tabs. */
function storedText(key: string, maxLength: number): StoredText {
  const listeners = new Set<() => void>();
  let loaded = false;
  let cache: string | null = null;

  function read(): string | null {
    if (loaded) return cache;
    try {
      cache = window.localStorage.getItem(key)?.slice(0, maxLength) ?? null;
    } catch {
      // Blocked storage: the field starts empty instead of breaking the page.
      cache = null;
    }
    loaded = true;
    return cache;
  }

  function write(value: string | null): void {
    cache = value === null ? null : value.slice(0, maxLength);
    loaded = true;
    try {
      if (cache === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, cache);
    } catch {
      // Storage full or blocked: the text still works for this page view.
    }
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return;
      loaded = false;
      listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }

  return { read, write, subscribe };
}

const instructionsText = storedText(INSTRUCTIONS_KEY, BRIEF_INSTRUCTIONS_MAX);
// null means the owner has not typed a site, so the first site in the cart is used; '' means they cleared it.
const sourceUrlText = storedText(SOURCE_URL_KEY, CART_SOURCE_URL_MAX);

export const cartInstructionsActions = {
  set(text: string): void {
    instructionsText.write(text === '' ? null : text);
  },
  setSourceUrl(text: string): void {
    sourceUrlText.write(text);
  },
  /** Empties both checkout texts; the cart calls it when it is emptied. */
  clear(): void {
    instructionsText.write(null);
    sourceUrlText.write(null);
  },
  snapshot(): string {
    return instructionsText.read() ?? '';
  },
  sourceUrlSnapshot(): string | null {
    return sourceUrlText.read();
  },
};

function readInstructions(): string {
  return instructionsText.read() ?? '';
}

/** The checkout instructions of this browser; empty during server rendering and the first hydration pass. */
export function useCartInstructions(): string {
  return useSyncExternalStore(instructionsText.subscribe, readInstructions, () => '');
}

/** The site text the owner typed at checkout; null when untouched, and during server rendering. */
export function useCartSourceUrl(): string | null {
  return useSyncExternalStore(sourceUrlText.subscribe, sourceUrlText.read, () => null);
}
