import { Inject, Injectable } from '@nestjs/common';
import { type PlatformView } from '@studio/shared/api';
import {
  capabilityStatus,
  type AccountFile,
  type CapabilityStatus,
  type HealthFile,
  type Platform,
  type PlatformGates,
  type PlatformMode,
} from '@studio/shared/platforms';
import { livePlatformClientFactories } from './clients/platform-client.registry';
import { PLATFORM_MODE_SETTINGS, type PlatformModeSettings } from './platform-modes.config';
import { PlatformCredentials } from './platform-credentials';
import { AccountStore, GateStore, HealthReader } from './stores/platform-file.stores';

/** Everything section 5.3 derives a platform's state from, read once. */
export interface PlatformSnapshot {
  platform: Platform;
  mode: PlatformMode;
  gates: PlatformGates;
  /** `account.json` in any state, or null when never connected. */
  account: AccountFile | null;
  /** `health.json` only when it applies to the account's current `connectionId`. */
  health: HealthFile | null;
  status: Readonly<Record<'metrics' | 'publish', CapabilityStatus>>;
}

/**
 * Reads gates, the account, its health and (live mode only) whether the client credentials resolve
 * and a live client is bound, then applies the shared `capabilityStatus` (SPEC 0007 section 5.3).
 * Mock mode needs no credential and never touches the Keychain (section 5.8). Read-only.
 */
@Injectable()
export class PlatformStatusReader {
  constructor(
    @Inject(PLATFORM_MODE_SETTINGS) private readonly modes: PlatformModeSettings,
    private readonly gates: GateStore,
    private readonly accounts: AccountStore,
    private readonly healthReader: HealthReader,
    private readonly credentials: PlatformCredentials,
  ) {}

  async snapshot(platform: Platform): Promise<PlatformSnapshot> {
    const mode = this.modes[platform].mode;
    const gates = await this.gates.read(platform);
    const account = await this.accounts.read(platform);
    const health = account === null ? null : await this.healthReader.forConnection(platform, account.connectionId);
    const credentialsConfigured =
      mode === 'mock' || (livePlatformClientFactories[platform] !== null && (await this.credentials.isConfigured(platform)));
    const statusOf = (capability: 'metrics' | 'publish'): CapabilityStatus =>
      capabilityStatus({ platform, capability, gates, mode, credentialsConfigured, account, health });
    return { platform, mode, gates, account, health, status: { metrics: statusOf('metrics'), publish: statusOf('publish') } };
  }
}

/** One `/contas` card (C10 rev 7 `PlatformView`). The account label is shown, never logged. */
export function toPlatformView(snapshot: PlatformSnapshot, trackedPublications: number): PlatformView {
  const connected = snapshot.account !== null && snapshot.account.state === 'connected' ? snapshot.account : null;
  const health = connected === null ? null : snapshot.health;
  return {
    platform: snapshot.platform,
    mode: snapshot.mode,
    gates: { metrics: snapshot.gates.metrics, publish: snapshot.gates.publish },
    status: { metrics: snapshot.status.metrics, publish: snapshot.status.publish },
    reconnectReason: health === null ? null : health.reconnectReason,
    accountLabel: connected === null ? null : connected.accountLabel,
    connectedAt: connected === null ? null : connected.connectedAt,
    lastPollAt: health === null ? null : health.lastPollAt,
    backoff: health === null ? null : health.backoff,
    trackedPublications,
    importFallback: true,
  };
}
