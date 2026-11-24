import type { InstallPresence, InstallToken, PairCode } from '@studio/shared/api';
import type { LoopbackClient, LoopbackResult } from '@/install/loopback-client';
import {
  readLoopbackPermission,
  watchLoopbackPermission,
  type LoopbackPermission,
  type PermissionQuerier,
} from '@/install/loopback-permission';
import type { TokenStore } from '@/install/token-store';
import { isLoopbackBlockedBrowser } from '@/platform/browser-platform';
import { NOT_INSTALLED_VERDICT_MS, nextPollDelay, type DetectionEvent } from './detection-machine';
import type { Clock, VisibilitySource } from './runtime-ports';

export interface DetectionDependencies {
  client: LoopbackClient;
  permissions: PermissionQuerier | undefined;
  tokens: TokenStore;
  clock: Clock;
  visibility: VisibilitySource;
  userAgent: string;
  /** Hands out the one-time code read from the fragment, once; later calls return `undefined`. */
  claimPairCode: () => PairCode | undefined;
  dispatch: (event: DetectionEvent) => void;
}

export interface DetectionHandle {
  /** "Check again": a fresh presence call. */
  restart: () => void;
  stop: () => void;
}

/**
 * Runs the effects behind the detection state machine: permission watch, the presence call with
 * its 5-second verdict, pairing, and the status poll (at most every 10 seconds, visible tab only).
 * Every result reaches the UI as a `DetectionEvent`; nothing from a status payload leaves this
 * module except through `dispatch`.
 */
export function startDetection(deps: DetectionDependencies): DetectionHandle {
  const browserBlocked = isLoopbackBlockedBrowser(deps.userAgent);
  let stopped = false;
  let generation = 0;
  let permission: LoopbackPermission = 'unknown';
  let token: InstallToken | undefined;
  let polling = false;
  let lastPolledAt: number | undefined;
  let cancelPoll: (() => void) | undefined;
  let presenceAbort: AbortController | undefined;
  let stopPermissionWatch: () => void = () => undefined;
  const stopVisibilityWatch = deps.visibility.onChange(onVisibilityChange);

  function isCurrent(runGeneration: number): boolean {
    return !stopped && runGeneration === generation;
  }

  function stopPolling(): void {
    polling = false;
    cancelPoll?.();
    cancelPoll = undefined;
  }

  function onPermissionChange(next: LoopbackPermission): void {
    const previous = permission;
    permission = next;
    if (stopped) return;
    if (next === 'denied') {
      stopPolling();
      deps.dispatch({ type: 'permission-denied' });
    } else if (next === 'granted' && previous === 'denied') {
      restart();
    }
    // `prompt` to `granted` needs nothing: the open presence call proceeds by itself.
  }

  function onVisibilityChange(): void {
    if (deps.visibility.isVisible()) schedulePoll();
    else {
      cancelPoll?.();
      cancelPoll = undefined;
    }
  }

  function schedulePoll(): void {
    cancelPoll?.();
    cancelPoll = undefined;
    if (stopped || !polling || !deps.visibility.isVisible()) return;
    const runGeneration = generation;
    cancelPoll = deps.clock.schedule(() => void pollOnce(runGeneration), nextPollDelay(lastPolledAt, deps.clock.now()));
  }

  async function pollOnce(runGeneration: number): Promise<void> {
    if (!isCurrent(runGeneration) || token === undefined || !deps.visibility.isVisible()) return;
    lastPolledAt = deps.clock.now();
    const result = await deps.client.status(token);
    if (!isCurrent(runGeneration)) return;
    switch (result.kind) {
      case 'ok':
        deps.dispatch({ type: 'status-received', status: result.value });
        schedulePoll();
        return;
      case 'unauthorized':
        stopPolling();
        token = undefined;
        deps.tokens.forget();
        deps.dispatch({ type: 'token-rejected' });
        return;
      case 'network-error':
        stopPolling();
        deps.dispatch({ type: 'connection-lost' });
        return;
      case 'contract-mismatch':
      case 'unavailable':
      case 'http-error':
        stopPolling();
        deps.dispatch({ type: 'contract-unknown' });
        return;
    }
  }

  function startPolling(): void {
    polling = true;
    lastPolledAt = undefined;
    schedulePoll();
  }

  async function pair(code: PairCode, presence: InstallPresence, runGeneration: number): Promise<void> {
    deps.dispatch({ type: 'presence-received', presence, hasToken: false });
    deps.dispatch({ type: 'pairing-started' });
    const result = await deps.client.pair(code);
    if (!isCurrent(runGeneration)) return;
    switch (result.kind) {
      case 'ok':
        token = result.value.token;
        // A refused write keeps the pairing for this tab only; the next visit asks again.
        deps.tokens.write(result.value.token);
        deps.dispatch({ type: 'paired' });
        startPolling();
        return;
      case 'unauthorized':
      case 'http-error':
        deps.dispatch({ type: 'pairing-rejected' });
        return;
      case 'network-error':
        deps.dispatch({ type: 'connection-lost' });
        return;
      case 'contract-mismatch':
      case 'unavailable':
        deps.dispatch({ type: 'contract-unknown' });
        return;
    }
  }

  async function onPresence(result: LoopbackResult<InstallPresence>, runGeneration: number): Promise<void> {
    switch (result.kind) {
      case 'ok': {
        const code = deps.claimPairCode();
        if (code !== undefined) {
          await pair(code, result.value, runGeneration);
          return;
        }
        token ??= deps.tokens.read();
        // The app reports no token at all: any token kept here is stale.
        if (token !== undefined && !result.value.paired) {
          token = undefined;
          deps.tokens.forget();
        }
        deps.dispatch({ type: 'presence-received', presence: result.value, hasToken: token !== undefined });
        if (token !== undefined) startPolling();
        return;
      }
      case 'network-error': {
        const fresh = await readLoopbackPermission(deps.permissions);
        if (!isCurrent(runGeneration)) return;
        permission = fresh;
        deps.dispatch({ type: 'presence-failed', permission: fresh });
        return;
      }
      // Presence is public and answers 200 or 503; anything else is a contract this page does not know.
      case 'contract-mismatch':
      case 'unavailable':
      case 'unauthorized':
      case 'http-error':
        deps.dispatch({ type: 'contract-unknown' });
        return;
    }
  }

  async function detectPresence(): Promise<void> {
    generation += 1;
    const runGeneration = generation;
    stopPolling();
    presenceAbort?.abort();
    const abort = new AbortController();
    presenceAbort = abort;
    let settled = false;
    const cancelVerdict = deps.clock.schedule(() => {
      if (settled || !isCurrent(runGeneration)) return;
      deps.dispatch({ type: 'presence-timed-out', permission });
      // Only a granted permission proves no prompt is open; otherwise the call stays open so an
      // answer to the prompt still completes it.
      if (permission === 'granted') abort.abort();
    }, NOT_INSTALLED_VERDICT_MS);
    const result = await deps.client.presence(abort.signal);
    settled = true;
    cancelVerdict();
    if (!isCurrent(runGeneration)) return;
    await onPresence(result, runGeneration);
  }

  function restart(): void {
    // Safari stays blocked by design: retrying cannot change the answer.
    if (stopped || browserBlocked) return;
    deps.dispatch({ type: 'restarted' });
    // Read the permission again: the user may have changed the site setting without a change event.
    void readLoopbackPermission(deps.permissions).then((fresh) => {
      if (stopped) return;
      permission = fresh;
      if (fresh === 'denied') deps.dispatch({ type: 'permission-denied' });
      else void detectPresence();
    });
  }

  async function begin(): Promise<void> {
    const watch = await watchLoopbackPermission(deps.permissions, onPermissionChange);
    if (stopped) {
      watch.stop();
      return;
    }
    stopPermissionWatch = watch.stop;
    permission = watch.current;
    if (permission === 'denied') {
      deps.dispatch({ type: 'permission-denied' });
      return;
    }
    await detectPresence();
  }

  if (browserBlocked) {
    deps.dispatch({ type: 'browser-blocked' });
  } else {
    void begin();
  }

  return {
    restart,
    stop: () => {
      stopped = true;
      presenceAbort?.abort();
      stopPolling();
      stopPermissionWatch();
      stopVisibilityWatch();
    },
  };
}
