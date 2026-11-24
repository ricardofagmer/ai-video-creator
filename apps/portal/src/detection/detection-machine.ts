import type { InstallPresence, InstallStatus } from '@studio/shared/api';
import type { LoopbackPermission } from '@/install/loopback-permission';

/**
 * What the portal knows about the studio on this computer (plan rev 3 section 9, "Portal
 * behaviour"). Pure: the reducer takes events from the controller and never performs effects.
 * "Update available" is not a state; it overlays the installed states (see `installedVersion`).
 */
export type DetectionState =
  | { kind: 'checking' }
  /** Safari: loopback calls from an HTTPS page are blocked by design (DI-AC-18). */
  | { kind: 'loopback-blocked' }
  /** The browser is asking the user to allow access to apps on this device. */
  | { kind: 'permission-prompt' }
  | { kind: 'permission-denied' }
  /** Connection refused: no app, or the app is not running (DI-AC-15). */
  | { kind: 'not-installed' }
  | { kind: 'installed-unpaired'; presence: InstallPresence; pairing: PairingPhase }
  | { kind: 'paired'; presence: InstallPresence; status: InstallStatus | undefined }
  /** The app answered in a shape or contract number this page does not know: "update the app". */
  | { kind: 'unknown-contract' };

export type PairingPhase = 'idle' | 'pairing' | 'rejected';

export type DetectionEvent =
  | { type: 'restarted' }
  | { type: 'browser-blocked' }
  | { type: 'permission-denied' }
  /** The presence call failed at the network level; `permission` is read again after the failure. */
  | { type: 'presence-failed'; permission: LoopbackPermission }
  /** DI-AC-15's 5-second mark passed with the presence call still open. */
  | { type: 'presence-timed-out'; permission: LoopbackPermission }
  | { type: 'presence-received'; presence: InstallPresence; hasToken: boolean }
  | { type: 'contract-unknown' }
  | { type: 'pairing-started' }
  | { type: 'pairing-rejected' }
  | { type: 'paired' }
  | { type: 'status-received'; status: InstallStatus }
  | { type: 'token-rejected' }
  | { type: 'connection-lost' };

/** The 5-second verdict of DI-AC-15. */
export const NOT_INSTALLED_VERDICT_MS = 5_000;
/** DI-AC-16: status is refreshed at most this often, and only while the tab is visible. */
export const STATUS_POLL_INTERVAL_MS = 10_000;

export const initialDetectionState: DetectionState = { kind: 'checking' };

/**
 * A failed presence call has four possible causes (vetting 0006 section 9 item 3). With no
 * connection the browser shows no prompt, so a failure under `prompt` means nothing is listening.
 */
export function verdictAfterFailure(permission: LoopbackPermission): DetectionState {
  return permission === 'denied' ? { kind: 'permission-denied' } : { kind: 'not-installed' };
}

/**
 * The call is still open after 5 seconds. Only a granted permission proves no prompt is open;
 * under `prompt` or an unreadable permission the prompt may be on screen, and "not installed"
 * must never fire then (plan rev 3 section 9).
 */
export function verdictAfterTimeout(permission: LoopbackPermission): DetectionState {
  if (permission === 'granted') return { kind: 'not-installed' };
  if (permission === 'denied') return { kind: 'permission-denied' };
  return { kind: 'permission-prompt' };
}

function isOpenCheck(state: DetectionState): boolean {
  return state.kind === 'checking' || state.kind === 'permission-prompt';
}

export function reduceDetection(state: DetectionState, event: DetectionEvent): DetectionState {
  switch (event.type) {
    case 'restarted':
      return state.kind === 'loopback-blocked' ? state : initialDetectionState;
    case 'browser-blocked':
      return { kind: 'loopback-blocked' };
    case 'permission-denied':
      return state.kind === 'loopback-blocked' ? state : { kind: 'permission-denied' };
    case 'presence-failed':
      return isOpenCheck(state) ? verdictAfterFailure(event.permission) : state;
    case 'presence-timed-out':
      return state.kind === 'checking' ? verdictAfterTimeout(event.permission) : state;
    case 'presence-received':
      if (!isOpenCheck(state)) return state;
      return event.hasToken
        ? { kind: 'paired', presence: event.presence, status: undefined }
        : { kind: 'installed-unpaired', presence: event.presence, pairing: 'idle' };
    case 'contract-unknown':
      return { kind: 'unknown-contract' };
    case 'pairing-started':
      return state.kind === 'installed-unpaired' ? { ...state, pairing: 'pairing' } : state;
    case 'pairing-rejected':
      return state.kind === 'installed-unpaired' ? { ...state, pairing: 'rejected' } : state;
    case 'paired':
      return state.kind === 'installed-unpaired' ? { kind: 'paired', presence: state.presence, status: undefined } : state;
    case 'status-received':
      return state.kind === 'paired' ? { ...state, status: event.status } : state;
    case 'token-rejected':
      return state.kind === 'paired' ? { kind: 'installed-unpaired', presence: state.presence, pairing: 'idle' } : state;
    case 'connection-lost':
      return state.kind === 'paired' || state.kind === 'installed-unpaired' ? { kind: 'not-installed' } : state;
    default:
      return assertNever(event);
  }
}

/** The installed version shown and compared with `latest.json`; status wins over presence when fresher. */
export function installedVersion(state: DetectionState): string | undefined {
  if (state.kind === 'paired') return state.status?.version ?? state.presence.version;
  if (state.kind === 'installed-unpaired') return state.presence.version;
  return undefined;
}

/** Pure scheduling for DI-AC-16: how long until the next status poll may run. */
export function nextPollDelay(lastPolledAt: number | undefined, now: number): number {
  if (lastPolledAt === undefined) return 0;
  return Math.max(0, lastPolledAt + STATUS_POLL_INTERVAL_MS - now);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled detection event: ${JSON.stringify(value)}`);
}
