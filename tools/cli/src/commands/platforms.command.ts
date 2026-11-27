import { type GateState, type Platform, type PlatformCapability } from '@studio/shared/platforms';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { PLATFORM_LABELS } from '../platforms/platform-labels.js';
import { type PlatformGateway } from '../platforms/platform-gateway.js';
import { platformDetailLines, platformListLines } from '../platforms/platform-text.js';
import { type CommandDependencies } from './command-dependencies.js';

/** Injected so the platform commands are testable without core or the system clock. */
export interface PlatformCommandPorts {
  gateway: PlatformGateway;
  now: () => Date;
}

export interface GateCommandOptions {
  platform: Platform;
  capability: PlatformCapability;
}

/** `studio platforms list`: status words, account, last poll and backoff per platform (AC 44). */
export async function platformsListCommand(ports: PlatformCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const views = await ports.gateway.list();
  for (const line of platformListLines(views, { now: ports.now(), webPort: dependencies.settings.ports.web })) dependencies.printer.line(line);
  return ExitCode.ok;
}

/** Section 5.3: the consequence the web's confirmation names, printed after the gate opens. */
function openingConsequence(platform: Platform, capability: PlatformCapability): string {
  const name = PLATFORM_LABELS[platform];
  const text = cliText().platforms.gate;
  return capability === 'publish' ? text.publishOpened(name) : text.metricsOpened(name);
}

/**
 * `studio platforms enable|disable <platform> --capability <c>` (section 5.3): only the owner turns
 * a capability on or off; the studio never flips a gate itself. Enabling Instagram `publish` is
 * refused by core with `platform-publish-unsupported` (OD8) and nothing is written.
 */
export async function platformsGateCommand(
  state: GateState,
  options: GateCommandOptions,
  ports: PlatformCommandPorts,
  dependencies: CommandDependencies,
): Promise<number> {
  const { printer } = dependencies;
  const view = await ports.gateway.setGate(options.platform, { capability: options.capability, state });
  const text = cliText().platforms;
  const capability = text.capabilities[options.capability];
  const name = PLATFORM_LABELS[options.platform];
  printer.line(state === 'enabled' ? text.gate.enabled(capability, name) : text.gate.disabled(capability, name));
  if (state === 'enabled') printer.line(openingConsequence(options.platform, options.capability));
  for (const line of platformDetailLines(view, ports.now())) printer.line(line);
  if (view.status[options.capability] === 'needs-reconnect' || view.status[options.capability] === 'disconnected') {
    printer.line(text.connectIsWebOnly(dependencies.settings.ports.web));
  }
  return ExitCode.ok;
}

/**
 * `studio platforms disconnect <platform>` (section 5.2): core holds `token.lock`, makes the one
 * best-effort revoke at the platform, deletes the Keychain item and sets `account.json` to
 * `disconnected`. A failed revoke does not stop the delete; unless the platform confirmed the revoke
 * (owner decision 2026-11-21), the owner is told where to check.
 */
export async function platformsDisconnectCommand(platform: Platform, ports: PlatformCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const { printer } = dependencies;
  const result = await ports.gateway.disconnect(platform);
  const name = PLATFORM_LABELS[platform];
  const text = cliText().platforms.disconnect;
  printer.line(text.done(name));
  printer.line(result.revoke === 'revoked' ? text.revoked(name) : text.checkThere(name));
  for (const line of platformDetailLines(result, ports.now())) printer.line(line);
  return ExitCode.ok;
}

/**
 * `studio platforms connect <platform>` (section 5.9): connect is web-only, because the platform
 * sends the browser back to the api's callback. The command starts nothing and says so (exit 2).
 */
export function platformsConnectCommand(platform: Platform, dependencies: CommandDependencies): number {
  dependencies.printer.error(`${PLATFORM_LABELS[platform]}: ${cliText().platforms.connectIsWebOnly(dependencies.settings.ports.web)}`);
  return ExitCode.usage;
}
