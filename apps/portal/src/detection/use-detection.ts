'use client';

import type { PairCode } from '@studio/shared/api';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { PortalConfig } from '@/config/portal-config';
import { browserLoopbackFetch, createLoopbackClient } from '@/install/loopback-client';
import { browserPermissionQuerier } from '@/install/loopback-permission';
import { browserAddressBar, takePairCode } from '@/install/pairing-fragment';
import { browserStorage, createTokenStore } from '@/install/token-store';
import { startDetection, type DetectionHandle } from './detection-controller';
import { initialDetectionState, reduceDetection, type DetectionState } from './detection-machine';
import { browserClock, browserVisibility } from './runtime-ports';

/**
 * The fragment is read and cleared once per page load, at module level, so React's development
 * double-mount does not lose the code; the controller claims it once, when it pairs.
 */
let pendingPairCode: { code: PairCode | undefined } | undefined;

function primePairCode(): void {
  pendingPairCode ??= { code: takePairCode(browserAddressBar()) };
}

function claimPairCode(): PairCode | undefined {
  const code = pendingPairCode?.code;
  pendingPairCode = { code: undefined };
  return code;
}

export interface DetectionView {
  state: DetectionState;
  checkAgain: () => void;
}

/** Wires the pure detection machine to the browser: real fetch, permissions, storage, timers. */
export function useDetection(config: PortalConfig): DetectionView {
  const [state, dispatch] = useReducer(reduceDetection, initialDetectionState);
  const handle = useRef<DetectionHandle | undefined>(undefined);

  useEffect(() => {
    primePairCode();
    const detection = startDetection({
      client: createLoopbackClient({ apiOrigin: config.apiOrigin, fetch: browserLoopbackFetch }),
      permissions: browserPermissionQuerier(),
      tokens: createTokenStore(browserStorage()),
      clock: browserClock,
      visibility: browserVisibility(),
      userAgent: navigator.userAgent,
      claimPairCode,
      dispatch,
    });
    handle.current = detection;
    return () => {
      detection.stop();
      handle.current = undefined;
    };
  }, [config.apiOrigin]);

  const checkAgain = useCallback(() => handle.current?.restart(), []);
  return { state, checkAgain };
}
