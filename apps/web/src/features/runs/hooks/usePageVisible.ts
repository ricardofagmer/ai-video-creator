'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function isVisible(): boolean {
  return document.visibilityState !== 'hidden';
}

/** False while the tab is hidden; polling loops stop then and restart when it shows again. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, isVisible, () => true);
}
