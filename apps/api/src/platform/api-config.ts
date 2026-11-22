import { z } from 'zod';

/** A9: the api listens on `127.0.0.1:4311`; the web is `http://127.0.0.1:4310`. Both configurable. */
export const DEFAULT_API_PORT = 4311;
export const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:4310';
export const API_PORT_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_API_PORT';
export const WEB_ORIGIN_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_WEB_ORIGIN';

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

export class InvalidApiConfigError extends Error {
  readonly category = 'internal';

  constructor(readonly variable: string) {
    super(`Invalid api configuration: ${variable}`);
    this.name = 'InvalidApiConfigError';
  }
}

/** Resolved once by the composition root; no other provider reads the environment. */
export class ApiConfig {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedHosts: ReadonlySet<string>;

  constructor(
    readonly port: number,
    readonly webOrigin: string,
  ) {
    const webHost = new URL(webOrigin).host;
    this.allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, webHost]);
    this.allowedOrigins = new Set([webOrigin, `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
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
  return new ApiConfig(port, webOrigin);
}
