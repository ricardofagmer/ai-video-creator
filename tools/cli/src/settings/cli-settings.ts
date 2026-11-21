import { resolve } from 'node:path';
import { z } from 'zod';
import { DATA_HOME_ENV_VAR, resolveDataHome, type DataHome } from '@studio/core/paths';
import { platformMockFaultVariable, platformModeVariable } from '@studio/core/platforms';
import { mockFaultVariable, modeVariable } from '@studio/core/providers';
import { SEED_SOURCE_ROOT_ENV_VAR } from '@studio/core/seed';
import { PlatformSchema } from '@studio/shared/platforms';
import { ProviderNameSchema } from '@studio/shared/run-format';
import { CliConfigurationError } from '../errors/cli.errors.js';

/** A9 defaults: web on `127.0.0.1:4310`, api on `127.0.0.1:4311`. */
export const DEFAULT_WEB_PORT = 4310;
export const DEFAULT_API_PORT = 4311;

/** Same variable the api reads (apps/api `ApiConfig`), so `studio start` and the api agree. */
export const API_PORT_ENV_VAR = 'VIDEO_STUDIO_API_PORT';
/** CLI-side web port; the api receives it as `VIDEO_STUDIO_WEB_ORIGIN`. */
export const WEB_PORT_ENV_VAR = 'VIDEO_STUDIO_WEB_PORT';

/** Used when the caller has no PATH: Apple Silicon Homebrew first (A18), then the system folders. */
const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

/** Non-secret variables a started api or web may need; nothing else of the caller's env is passed. */
const BASE_CHILD_VARIABLES = ['HOME', 'TMPDIR', 'LANG'];

const PortSchema = z
  .string()
  .regex(/^[0-9]{4,5}$/, 'expected a port number')
  .transform((value) => Number.parseInt(value, 10))
  .refine((port) => port >= 1024 && port <= 65535, { message: 'expected an unprivileged port 1024..65535' });

export interface CliPorts {
  web: number;
  api: number;
}

/**
 * Everything the CLI takes from its environment, read once in `main` (rules/architecture.md
 * "Configuration"). `childEnvironment` is the explicit allowlist handed to `studio start`
 * children (SPEC 0002 rev 3): never `process.env` wholesale, never a provider key.
 */
export interface CliSettings {
  dataHome: DataHome;
  ports: CliPorts;
  /** The monorepo root that holds `apps/api` and `apps/web`. */
  studioRoot: string;
  /** `PATH` plus the allowlisted non-secret variables that were set. */
  childEnvironment: Readonly<Record<string, string>>;
  /** Names of provider-key variables that are set; never their values. */
  keyVariablesSet: readonly string[];
}

export interface CliSettingsSource {
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  /** `import.meta.dirname` of `dist/main.js`; the monorepo root is three levels up. */
  cliDirectory: string;
}

function readPort(environment: CliSettingsSource['environment'], variable: string, fallback: number): number {
  const raw = environment[variable]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const parsed = PortSchema.safeParse(raw);
  // The variable is named, never its value.
  if (!parsed.success) throw new CliConfigurationError(variable);
  return parsed.data;
}

/**
 * Studio variables a child may need: data home, seed root, the provider mock/live switches and the
 * platform mock/live switches (SPEC 0007 section 5.8), so a started api runs each platform in the
 * same mode as the CLI and an account is never seen in the other mode. The platform app
 * credentials are not passed: the api reads them from the Keychain, like the provider keys.
 */
function studioVariableNames(): string[] {
  const providerVariables = ProviderNameSchema.options.flatMap((provider) => [modeVariable(provider), mockFaultVariable(provider)]);
  const platformVariables = PlatformSchema.options.flatMap((platform) => [platformModeVariable(platform), platformMockFaultVariable(platform)]);
  return [DATA_HOME_ENV_VAR, SEED_SOURCE_ROOT_ENV_VAR, ...providerVariables, ...platformVariables];
}

function childEnvironmentOf(environment: CliSettingsSource['environment']): Record<string, string> {
  const child: Record<string, string> = { PATH: environment['PATH'] ?? FALLBACK_PATH };
  for (const name of [...BASE_CHILD_VARIABLES, ...studioVariableNames()]) {
    const value = environment[name];
    if (value !== undefined && value !== '') child[name] = value;
  }
  return child;
}

export function readCliSettings(source: CliSettingsSource, keyVariableNames: readonly string[]): CliSettings {
  const { environment } = source;
  const ports: CliPorts = {
    web: readPort(environment, WEB_PORT_ENV_VAR, DEFAULT_WEB_PORT),
    api: readPort(environment, API_PORT_ENV_VAR, DEFAULT_API_PORT),
  };
  if (ports.web === ports.api) throw new CliConfigurationError(WEB_PORT_ENV_VAR);
  return {
    dataHome: resolveDataHome({ homeDirectory: source.homeDirectory, override: environment[DATA_HOME_ENV_VAR] }),
    ports,
    studioRoot: resolve(source.cliDirectory, '..', '..', '..'),
    childEnvironment: childEnvironmentOf(environment),
    keyVariablesSet: keyVariableNames.filter((name) => (environment[name] ?? '').trim() !== ''),
  };
}
