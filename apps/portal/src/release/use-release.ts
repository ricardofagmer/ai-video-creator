'use client';

import { useEffect, useState } from 'react';
import type { ReleaseManifestLocation } from '@/config/portal-config';
import { browserManifestFetch, loadReleaseManifest, type ReleaseState } from './release-loader';

/** Loads `latest.json` once per page load; the unconfigured case never makes a request. */
export function useRelease(location: ReleaseManifestLocation): ReleaseState {
  const [state, setState] = useState<ReleaseState>(
    location.kind === 'configured' ? { kind: 'loading' } : { kind: 'not-configured' },
  );

  useEffect(() => {
    if (location.kind !== 'configured') return;
    const abort = new AbortController();
    void loadReleaseManifest(location, { fetch: browserManifestFetch, signal: abort.signal }).then((next) => {
      if (!abort.signal.aborted) setState(next);
    });
    return () => abort.abort();
  }, [location]);

  return state;
}
