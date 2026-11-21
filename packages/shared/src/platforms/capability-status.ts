import { type Platform } from '../metrics/enums';
import { type AccountFile, type HealthFile } from './connection-files';
import { platformPublishSupport, type PlatformGates } from './constants';
import { type CapabilityStatus, type GateState, type PlatformCapability, type PlatformMode } from './enums';

/*
 * Gates and the derived status (SPEC 0007 section 5.3, OD2, OD8), pure and browser-safe. The api,
 * the watcher, the web and the CLI read the same answer; nothing here reads a file or a secret.
 */

export interface CapabilityStatusInput {
  platform: Platform;
  capability: PlatformCapability;
  /** The platform's gates from `gates.json`, or `defaultGates[platform]` when the file is absent. */
  gates: PlatformGates;
  /** This process's mode for the platform. */
  mode: PlatformMode;
  /** Whether both OAuth client credentials of the platform resolve (environment, then Keychain). */
  credentialsConfigured: boolean;
  /** `account.json`, or null when the platform was never connected. */
  account: Pick<AccountFile, 'state' | 'connectionId' | 'capabilities'> | null;
  /** `health.json`, or null when the watcher has not written one yet. */
  health: Pick<HealthFile, 'connectionId' | 'token'> | null;
}

/**
 * Section 5.3, first match: `unsupported` (publishing is not supported on the platform, OD8);
 * `awaiting-review` (gate closed); `not-configured` (live mode without client credentials);
 * `disconnected` (no connected account, or its capabilities lack this one); `needs-reconnect`
 * (`health.json` says so for this `connectionId`); otherwise `connected`.
 */
export function capabilityStatus(input: CapabilityStatusInput): CapabilityStatus {
  if (input.capability === 'publish' && !platformPublishSupport[input.platform]) return 'unsupported';
  if (input.gates[input.capability] === 'awaiting-review') return 'awaiting-review';
  if (input.mode === 'live' && !input.credentialsConfigured) return 'not-configured';
  const account = input.account;
  if (account === null || account.state !== 'connected' || !account.capabilities.includes(input.capability)) {
    return 'disconnected';
  }
  if (input.health !== null && input.health.connectionId === account.connectionId && input.health.token === 'needs-reconnect') {
    return 'needs-reconnect';
  }
  return 'connected';
}

/** `applied`: the gates to write. `refused`: nothing is written. */
export type GateChangeResult =
  | { status: 'applied'; gates: PlatformGates }
  | { status: 'refused'; reason: 'platform-publish-unsupported' };

/**
 * The owner's gate change (`PATCH /platforms/:platform/gate`, `studio platforms enable|disable`).
 * Enabling a capability the platform does not support (Instagram `publish`, OD8) is refused; closing
 * any gate is always allowed. The studio never calls this on its own.
 */
export function applyGateChange(options: {
  platform: Platform;
  gates: PlatformGates;
  capability: PlatformCapability;
  state: GateState;
}): GateChangeResult {
  if (options.state === 'enabled' && options.capability === 'publish' && !platformPublishSupport[options.platform]) {
    return { status: 'refused', reason: 'platform-publish-unsupported' };
  }
  const gates: PlatformGates =
    options.capability === 'metrics'
      ? { metrics: options.state, publish: options.gates.publish }
      : { metrics: options.gates.metrics, publish: options.state };
  return { status: 'applied', gates };
}
