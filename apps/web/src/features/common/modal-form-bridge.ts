'use client';

import { createContext, useContext, useEffect } from 'react';

/** What a route modal offers the form inside it. */
export interface ModalFormBridge {
  /** Reports whether the form holds unsaved changes, so closing the modal asks first. */
  setDirty: (dirty: boolean) => void;
  /** Leaves the modal; `saved` skips the unsaved-changes question and refreshes the list behind it. */
  close: (options?: { saved?: boolean }) => void;
}

export const ModalFormBridgeContext = createContext<ModalFormBridge | null>(null);

/** The surrounding route modal, kept informed of `dirty`; null when the form is rendered as a full page. */
export function useModalFormBridge(dirty: boolean): ModalFormBridge | null {
  const bridge = useContext(ModalFormBridgeContext);
  useEffect(() => {
    bridge?.setDirty(dirty);
  }, [bridge, dirty]);
  useEffect(() => () => bridge?.setDirty(false), [bridge]);
  return bridge;
}
