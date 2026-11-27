'use client';

import { type AssetVersionView } from '@studio/shared/api';
import { AssetKindSchema, type AssetKind } from '@studio/shared/catalog';
import { useSyncExternalStore } from 'react';
import { cartInstructionsActions } from './cart-instructions-store';

/** One catalog version in the cart: enough to show it and to bind or reference it, no asset content. */
export interface CartItem {
  /** `assetId@version`. */
  ref: string;
  name: string;
  kind: AssetKind;
  status: 'draft' | 'active' | 'deprecated';
  sensitivity: AssetVersionView['sensitivity'];
  /** The page link of a website reference (docs/specs/2026-11-23-site-analysis-design.md); absent otherwise. */
  siteUrl?: string;
  /** A voice the api can make a sample of, so checkout offers "Ouvir"; absent on other items and on items saved before. */
  voice?: boolean;
}

/** Same cap as C10 `CreateRunRequest.references`; a bigger cart could never be used in one run. */
export const MAX_CART_ITEMS = 50;
const STORAGE_KEY = 'studio.cart.v1';
const EMPTY: readonly CartItem[] = [];

const listeners = new Set<() => void>();
let cache: readonly CartItem[] | null = null;

function isCartItem(value: unknown): value is CartItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ref' in value &&
    typeof value.ref === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'kind' in value &&
    AssetKindSchema.safeParse(value.kind).success &&
    'status' in value &&
    typeof value.status === 'string' &&
    'sensitivity' in value &&
    typeof value.sensitivity === 'string' &&
    (!('siteUrl' in value) || value.siteUrl === undefined || typeof value.siteUrl === 'string') &&
    (!('voice' in value) || value.voice === undefined || typeof value.voice === 'boolean')
  );
}

function read(): readonly CartItem[] {
  if (cache !== null) return cache;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed.filter(isCartItem).slice(0, MAX_CART_ITEMS) : EMPTY;
  } catch {
    // Blocked or corrupt storage: the cart starts empty instead of breaking the page.
    cache = EMPTY;
  }
  return cache;
}

function write(items: readonly CartItem[]): void {
  cache = items;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the cart still works for this page view.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const cartActions = {
  add(item: CartItem): void {
    const items = read();
    if (items.some((existing) => existing.ref === item.ref) || items.length >= MAX_CART_ITEMS) return;
    write([...items, item]);
  },
  remove(ref: string): void {
    write(read().filter((item) => item.ref !== ref));
  },
  /** Empties the cart and the instructions written at its checkout. */
  clear(): void {
    write(EMPTY);
    cartInstructionsActions.clear();
  },
  snapshot(): readonly CartItem[] {
    return read();
  },
};

/** The cart of this browser; empty during server rendering and the first hydration pass. */
export function useCart(): readonly CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** `?carrinho=1` on `/receitas/...` and `/execucoes/nova` asks the page to use the cart. */
export const CART_QUERY = 'carrinho';
