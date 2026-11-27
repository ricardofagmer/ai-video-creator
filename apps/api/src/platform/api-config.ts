import { isAbsolute, normalize } from 'node:path';
import { z } from 'zod';

/** A9: the api listens on `127.0.0.1:4311`; the web is `http://127.0.0.1:4310`. Both configurable. */
export const DEFAULT_API_PORT = 4311;
export const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:4310';
export const API_PORT_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_API_PORT';
export const WEB_ORIGIN_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN';
/** ADR 0010 decision 6, C1: the one cross-origin caller of `/install/*`. Unset: none is accepted. */
export const PORTAL_ORIGIN_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN';
/** C3 rev 2: set by the shell to the absolute `runtime/` folder; set means packaged mode. */
export const RUNTIME_DIR_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR';
/** Where Playwright keeps its browsers when moved from its default cache folder. */
export const PLAYWRIGHT_BROWSERS_ENV_VAR = 'PLAYWRIGHT_BROWSERS_PATH';

/** JSON bodies are recipes and briefs; uploads are multipart and never pass the JSON parser. */
export const JSON_BODY_LIMIT = '1mb';

const PortSchema = z
  .string()
  .regex(/^[0-9]{4,5}$/, 'expected a port number')
  .transform((value) => Number.parseInt(value, 10))
  .refine((port) => port >= 1024 && port <= 65535, { message: 'expected an unprivileged port 1024..65535' });

/** Only a loopback origin can be the web: the studio has no remote access (PRD 12). */
const LoopbackOriginSchema = z
  .string()
  .regex(/^http:\/\/(127\.0\.0\.1|localhost):[0-9]{4,5}$/, 'expected http://127.0.0.1:<port> or http://localhost:<port>');

/**
 * Exactly an `https://` origin: the URL's own serialized origin must equal the value, so a path,
 * query, fragment, trailing slash, user info or default port is refused rather than normalized.
 * One exception (desktop installer plan section 9.6): a portal under `next dev` on this computer,
 * which is a loopback origin like the web's own.
 */
const PortalOriginSchema = z.string().refine(
  (value) => {
    if (LoopbackOriginSchema.safeParse(value).success) return true;
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  },
  { message: 'expected https://<host>[:<port>] or a loopback http origin, with no path' },
);

/** An absolute, already-normalized folder; the variable holds a path, never a secret (C3 rev 2). */
const AbsoluteDirectorySchema = z.string().refine(
  (value) => {
    const hasTrailingSeparator = value.length > 1 && /[\\/]$/.test(value);
    return !value.includes('\u0000') && isAbsolute(value) && normalize(value) === value && !hasTrailingSeparator;
  },
  { message: 'expected an absolute normalized folder' },
);

export class InvalidApiConfigError extends Error {
  readonly category = 'internal';

  constructor(readonly variable: string) {
    super(`Invalid api configuration: ${variable}`);
    this.name = 'InvalidApiConfigError';
  }
}

/** Install-related settings (desktop installer C1, C3 rev 2); null means unset. */
export interface InstallEnvironment {
  /** The exact portal origin, or null: no cross-origin caller is accepted. */
  portalOrigin: string | null;
  /** The packaged `runtime/` folder, or null in development (binaries come from PATH). */
  runtimeDirectory: string | null;
  /** The `PATH` handed to binary probes in development; never logged or returned. */
  executableSearchPath: string | null;
  /** `PLAYWRIGHT_BROWSERS_PATH` when set to a folder, else null (Playwright's default cache). */
  playwrightBrowsersDirectory: string | null;
}

const NO_INSTALL_ENVIRONMENT: InstallEnvironment = {
  portalOrigin: null,
  runtimeDirectory: null,
  executableSearchPath: null,
  playwrightBrowsersDirectory: null,
};

/** Resolved once by the composition root; no other provider reads the environment. */
export class ApiConfig {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedHosts: ReadonlySet<string>;
  /** C1: `/install/*` accepts only the api's own loopback hosts, never the web's. */
  readonly installHosts: ReadonlySet<string>;

  constructor(
    readonly port: number,
    readonly webOrigin: string,
    readonly install: InstallEnvironment = NO_INSTALL_ENVIRONMENT,
  ) {
    const webHost = new URL(webOrigin).host;
    this.allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, webHost]);
    this.allowedOrigins = new Set([webOrigin, `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
    this.installHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  }
}

function readOptional<Output>(schema: z.ZodType<Output, string>, value: string | undefined, variable: string): Output | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = schema.safeParse(value.trim());
  if (!parsed.success) throw new InvalidApiConfigError(variable);
  return parsed.data;
}

export function readApiConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const port = readOptional(PortSchema, environment[API_PORT_ENV_VAR], API_PORT_ENV_VAR) ?? DEFAULT_API_PORT;
  const webOrigin = readOptional(LoopbackOriginSchema, environment[WEB_ORIGIN_ENV_VAR], WEB_ORIGIN_ENV_VAR) ?? DEFAULT_WEB_ORIGIN;
  return new ApiConfig(port, webOrigin, readInstallEnvironment(environment));
}

function readInstallEnvironment(environment: NodeJS.ProcessEnv): InstallEnvironment {
  const searchPath = environment['PATH'];
  const browsers = environment[PLAYWRIGHT_BROWSERS_ENV_VAR];
  return {
    portalOrigin: readOptional(PortalOriginSchema, environment[PORTAL_ORIGIN_ENV_VAR], PORTAL_ORIGIN_ENV_VAR) ?? null,
    runtimeDirectory: readOptional(AbsoluteDirectorySchema, environment[RUNTIME_DIR_ENV_VAR], RUNTIME_DIR_ENV_VAR) ?? null,
    executableSearchPath: searchPath === undefined || searchPath === '' ? null : searchPath,
    // Playwright reads "0" as "inside node_modules"; only an absolute folder is followed here.
    playwrightBrowsersDirectory: browsers === undefined || !isAbsolute(browsers) ? null : normalize(browsers),
  };
}
