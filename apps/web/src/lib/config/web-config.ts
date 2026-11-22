import { z } from 'zod';

/**
 * Web configuration (SPEC 0002 A9): the web listens on `127.0.0.1:4310`, the api on
 * `127.0.0.1:4311`, both configurable. Read once per process from the environment and validated;
 * every value must stay on the loopback interface (PRD 12, criterion 23). No secret lives here.
 * Pure (no `server-only`) so the edge middleware can import it too.
 */
export const DEFAULT_WEB_PORT = 4310;
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4311';
export const WEB_PORT_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_WEB_PORT';
/** Same name the api reads to allowlist the web's Origin (`apps/api/src/platform/api-config.ts`). */
export const WEB_ORIGIN_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN';
/** Set by the `studio` CLI (R1-21) when it starts the web. */
export const API_ORIGIN_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_API_ORIGIN';

const loopbackOriginPattern = /^http:\/\/(127\.0\.0\.1|localhost):([0-9]{4,5})$/;

const PortSchema = z
  .string()
  .regex(/^[0-9]{4,5}$/, 'expected a port number')
  .transform((value) => Number.parseInt(value, 10))
  .refine((port) => port >= 1024 && port <= 65535, { message: 'expected an unprivileged port 1024..65535' });

/** `http://127.0.0.1:<port>` or `http://localhost:<port>`: no path, no credentials, no other host. */
const LoopbackOriginSchema = z
  .string()
  .regex(loopbackOriginPattern, 'expected http://127.0.0.1:<port> or http://localhost:<port>')
  .refine((value) => {
    const port = Number.parseInt(new URL(value).port, 10);
    return port >= 1024 && port <= 65535;
  }, 'expected an unprivileged port');

export class InvalidWebConfigError extends Error {
  constructor(readonly variable: string) {
    super(`Invalid web configuration: ${variable}`);
    this.name = 'InvalidWebConfigError';
  }
}

export interface WebConfig {
  /** Base URL of the local api, without a trailing slash. */
  apiBaseUrl: string;
  /** The web's own origin; the BFF sends it as `Origin` and accepts only it from browsers. */
  webOrigin: string;
  /** Host header values the web answers to (DNS-rebinding defence). */
  allowedHosts: ReadonlySet<string>;
}

type Environment = Readonly<Record<string, string | undefined>>;

function readOptional<Output>(schema: z.ZodType<Output, string>, environment: Environment, variable: string): Output | undefined {
  const value = environment[variable];
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = schema.safeParse(value.trim());
  if (!parsed.success) throw new InvalidWebConfigError(variable);
  return parsed.data;
}

function hostsOf(origin: string): Set<string> {
  const port = new URL(origin).port;
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export function readWebConfig(environment: Environment): WebConfig {
  const port = readOptional(PortSchema, environment, WEB_PORT_ENV_VAR) ?? DEFAULT_WEB_PORT;
  const webOrigin = readOptional(LoopbackOriginSchema, environment, WEB_ORIGIN_ENV_VAR) ?? `http://127.0.0.1:${port}`;
  const apiBaseUrl = readOptional(LoopbackOriginSchema, environment, API_ORIGIN_ENV_VAR) ?? DEFAULT_API_BASE_URL;
  return { apiBaseUrl, webOrigin, allowedHosts: hostsOf(webOrigin) };
}

let cachedConfig: WebConfig | null = null;

/** The process-wide configuration; throws `InvalidWebConfigError` on a bad value (fail fast). */
export function webConfig(): WebConfig {
  cachedConfig ??= readWebConfig(process.env);
  return cachedConfig;
}
