import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { mock } from 'node:test';
import { inspect } from 'node:util';
import { Logger, Module, type DynamicModule, type MiddlewareConsumer, type NestModule, type Provider, type Type } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { APP_FILTER, APP_GUARD, NestFactory, Reflector } from '@nestjs/core';
import { CommandBus, CqrsModule, EventBus, QueryBus } from '@nestjs/cqrs';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { hash } from '@node-rs/argon2';
import { DataHome, ensureDataHomeDirectories } from '@studio/core/paths';
import { PrismaService } from '@studio/core/prisma';
import { PASSPHRASE_HASH_SETTING_KEY, SESSION_COOKIE_NAME } from '@studio/shared/api';
import { readRunFile, runDirectory, writeRunFile } from '@studio/shared/run-files';
import { type RunId, type RunState } from '@studio/shared/run-format';
import { type NextFunction, type Request, type Response } from 'express';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { LoginThrottle } from '../auth/login-throttle';
import { PassphraseHashRepository, PassphraseVerifier } from '../auth/passphrase.verifier';
import { SessionGuard } from '../auth/session.guard';
import { SessionStore } from '../auth/session-store';
import { AssetVersionViewAssembler } from '../catalog/asset-version-view.assembler';
import { CatalogController } from '../catalog/catalog.controller';
import { CatalogReferenceService } from '../catalog/catalog-reference.service';
import { CatalogUploadService } from '../catalog/catalog-upload.service';
import { ConnectionCallbackController } from '../connections/connection-callback.controller';
import { HealthController, HealthService } from '../health/health.controller';
import { ApiConfig, DEFAULT_API_PORT, DEFAULT_WEB_ORIGIN, JSON_BODY_LIMIT } from '../platform/api-config';
import { ApiExceptionFilter } from '../platform/api-exception.filter';
import { AccessLogMiddleware, CorrelationMiddleware, HostOriginMiddleware, SecurityHeadersMiddleware } from '../platform/http.middleware';
import { RequestContext } from '../platform/request-context';
import { RunCursorReader } from '../runs/run-cursor.reader';
import { RunDecisionsController } from '../runs/run-decisions.controller';
import { RunIndexSync } from '../runs/run-index-sync.service';
import { RunScheduleLinkReader } from '../runs/run-schedule-link.reader';
import { RunsController } from '../runs/runs.controller';
import { FiredRunIndexSync } from '../schedules/fired-run-index.sync';
import { SearchIndexScheduler } from '../search/search-index.scheduler';
import { WatcherController } from '../watcher/watcher.controller';
import { WatcherStatusReader } from '../watcher/watcher-status.reader';

/*
 * Test-only harness for the api route tests (ticket 09, SPEC section 8.1 rules). Each test gets a
 * realpath'd temp root under os.tmpdir() holding the data home, a throwaway SQLite file migrated
 * from core's prisma/migrations, an owner home for by-reference paths and a folder outside it.
 * The studio's real data home, database, Keychain and home folder are never opened. A focused
 * Nest http app is booted per suite on 127.0.0.1 with an ephemeral port: the real middleware
 * chain, global SessionGuard, ApiExceptionFilter and JSON body limit of main.ts, with only the
 * controllers and collaborators a suite names. Anything else a controller could reach is an
 * "unreachable" stand-in that records the call and throws.
 *
 * The test runner (tsx, esbuild) emits no `design:paramtypes`, so Nest cannot inject api classes
 * that rely on emitted metadata. Services are built by hand here; controllers get the constructor
 * tokens tsc would emit (only when none exist). Reported as a testability finding.
 */

const FIXTURE_RUN_DIRECTORY = resolve(__dirname, '..', '..', '..', 'watcher', 'fixtures', 'product-tour-16x9');
const MIGRATIONS_DIRECTORY = resolve(__dirname, '..', '..', '..', '..', 'packages', 'core', 'prisma', 'migrations');
const REPOSITORY_ROOT = resolve(__dirname, '..', '..', '..', '..');
const PARAMTYPES_METADATA = 'design:paramtypes';
const UNREACHABLE_TOKEN = 'api-test-home:unreachable-collaborator';
const LOOPBACK_HOST = '127.0.0.1';

/** Fixed fake passphrase; asserted absent from every response body and log line. */
export const SENTINEL_PASSPHRASE = 'sentinel-passphrase-5f2c81-not-real';
/** Host header a loopback client sends to the configured api port (HostOriginMiddleware allowlist). */
export const API_HOST = `${LOOPBACK_HOST}:${DEFAULT_API_PORT}`;
/** The run id of the watcher's product-tour fixture run.json. */
export const FIXTURE_RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
/** Synthetic by-reference target folder name, created only inside the temp owner home. */
export const SYNTHETIC_CLONE_FOLDER = 'ricardo-clone';

/** Every Nest log call while the harness lives, as inspected text. */
export class CapturedLogs {
  readonly lines: string[] = [];

  record(level: string, args: readonly unknown[]): void {
    this.lines.push(`${level} ${inspect(args, { depth: 8, breakLength: Number.POSITIVE_INFINITY })}`);
  }

  text(): string {
    return this.lines.join('\n');
  }
}

export interface ApiTestHome {
  root: string;
  dataHome: DataHome;
  /** Stands in for the owner's home folder (`ReferenceRoots`); outside the data home. */
  ownerHome: string;
  /** Inside the temp root, outside both the owner home and the data home. */
  outside: string;
  prisma: PrismaService;
  logs: CapturedLogs;
  close(): Promise<void>;
}

export interface ApiRequest {
  method?: string;
  path: string;
  headers?: Readonly<Record<string, string>>;
  body?: string | Buffer;
}

export interface ApiResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

export interface ApiAppOptions {
  controllers: readonly Type<unknown>[];
  providers?: readonly Provider[];
}

export interface RunningApi {
  port: number;
  sessions: SessionStore;
  /** Calls that reached an unreachable stand-in, as `Token.member`. */
  reached: string[];
  send(request: ApiRequest): Promise<ApiResponse>;
  close(): Promise<void>;
}

class UnreachableCollaboratorError extends Error {
  constructor(readonly collaborator: string) {
    super(`A route reached a collaborator the test did not provide: ${collaborator}`);
    this.name = 'UnreachableCollaboratorError';
  }
}

function splitMigrationStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('--')) continue;
    current.push(line);
    const isTrigger = /^CREATE\s+TRIGGER/i.test(current[0]?.trim() ?? '');
    const ends = isTrigger ? trimmed.toUpperCase() === 'END;' : trimmed.endsWith(';');
    if (ends) {
      statements.push(current.join('\n'));
      current = [];
    }
  }
  assert.equal(current.length, 0, 'a migration ends inside a statement');
  return statements;
}

async function applyMigrations(prisma: PrismaService): Promise<void> {
  const folders = (await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(folders.length >= 6, 'expected the core migrations');
  for (const folder of folders) {
    const sql = await readFile(join(MIGRATIONS_DIRECTORY, folder, 'migration.sql'), 'utf8');
    for (const statement of splitMigrationStatements(sql)) await prisma.$executeRawUnsafe(statement);
  }
}

type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'verbose';
const capturedLevels: readonly LogLevel[] = ['log', 'warn', 'error', 'debug', 'verbose'];

function captureLogs(logs: CapturedLogs): (() => void)[] {
  return capturedLevels.map((level) => {
    const replaced = mock.method(Logger.prototype, level, (...args: unknown[]): void => logs.record(level, args));
    return (): void => replaced.mock.restore();
  });
}

/** A migrated throwaway home with the sentinel passphrase hash stored; call `close()` in `afterEach`. */
export async function createApiTestHome(prefix: string): Promise<ApiTestHome> {
  const temporaryRoot = await realpath(tmpdir());
  const root = await mkdtemp(join(temporaryRoot, `${prefix}-`));
  const dataHome = new DataHome(join(root, 'data'));
  // Safety: the database must live inside this test's temp folder, never the studio's data home.
  assert.ok(resolve(dataHome.databaseFile).startsWith(`${root}${sep}`), 'database outside the temp root');
  const ownerHome = join(root, 'owner');
  const outside = join(root, 'outside');
  await mkdir(ownerHome);
  await mkdir(outside);
  await ensureDataHomeDirectories(dataHome);
  const logs = new CapturedLogs();
  const logMocks = captureLogs(logs);
  const prisma = new PrismaService(dataHome);
  await prisma.onModuleInit();
  await applyMigrations(prisma);
  const encoded = await hash(SENTINEL_PASSPHRASE, { memoryCost: 4096, timeCost: 2, parallelism: 1 });
  await prisma.setting.upsert({
    where: { key: PASSPHRASE_HASH_SETTING_KEY },
    create: { key: PASSPHRASE_HASH_SETTING_KEY, value: encoded },
    update: { value: encoded },
  });
  return {
    root,
    dataHome,
    ownerHome,
    outside,
    prisma,
    logs,
    close: async (): Promise<void> => {
      await prisma.$disconnect();
      for (const restore of logMocks) restore();
      await rm(root, { recursive: true, force: true });
    },
  };
}

const inertKeys: ReadonlySet<PropertyKey> = new Set([
  'then',
  'constructor',
  'toJSON',
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
]);

/** A collaborator no route under test may call: any member call is recorded, then throws. */
function unreachable(name: string, reached: string[]): object {
  return new Proxy(
    {},
    {
      get(_target, key): unknown {
        if (typeof key === 'symbol' || inertKeys.has(key)) return undefined;
        return (): never => {
          reached.push(`${name}.${key}`);
          throw new UnreachableCollaboratorError(`${name}.${key}`);
        };
      },
    },
  );
}

/** The constructor tokens tsc emits for the controllers suites mount with real collaborators. */
const emittedControllerTokens: ReadonlyMap<Type<unknown>, readonly unknown[]> = new Map<Type<unknown>, readonly unknown[]>([
  [AuthController, [AuthService]],
  [HealthController, [HealthService]],
  [WatcherController, [WatcherStatusReader]],
  [RunDecisionsController, [CommandBus, RequestContext, RunIndexSync, SearchIndexScheduler]],
  // Interface- and Pick-typed parameters emit `Object`; their `@Inject()` tokens take precedence.
  [RunsController, [Object, Object, RequestContext, Object, Object, Object, RunCursorReader, Object, FiredRunIndexSync, RunScheduleLinkReader, Object]],
  [CatalogController, [CommandBus, QueryBus, CatalogUploadService, CatalogReferenceService, AssetVersionViewAssembler, SearchIndexScheduler]],
  [ConnectionCallbackController, [CommandBus, ApiConfig, RequestContext]],
]);

/**
 * Gives a controller the constructor metadata tsc would emit, when the runner emitted none. Any
 * controller outside the table gets unreachable placeholders: it is mounted only so the guard and
 * middleware can be exercised in front of it.
 */
function declareControllerTokens(controller: Type<unknown>): void {
  if (Reflect.hasOwnMetadata(PARAMTYPES_METADATA, controller)) return;
  const tokens = emittedControllerTokens.get(controller) ?? Array.from({ length: controller.length }, () => UNREACHABLE_TOKEN);
  assert.equal(tokens.length, controller.length, `${controller.name} constructor parameter count`);
  Reflect.defineMetadata(PARAMTYPES_METADATA, [...tokens], controller);
}

function constructorTokensOf(controller: Type<unknown>): unknown[] {
  const declared: unknown = Reflect.getMetadata(PARAMTYPES_METADATA, controller);
  const tokens: unknown[] = Array.isArray(declared) ? [...declared] : [];
  const selfDeclared: unknown = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, controller);
  if (Array.isArray(selfDeclared)) {
    for (const entry of selfDeclared) {
      if (typeof entry === 'object' && entry !== null && 'index' in entry && typeof entry.index === 'number' && 'param' in entry) {
        tokens[entry.index] = entry.param;
      }
    }
  }
  return tokens;
}

function tokenOf(provider: Provider): unknown {
  return typeof provider === 'function' ? provider : provider.provide;
}

function nameOf(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token);
}

const busTokens: ReadonlySet<unknown> = new Set([CommandBus, QueryBus, EventBus]);

function standInsFor(controllers: readonly Type<unknown>[], provided: ReadonlySet<unknown>, reached: string[]): Provider[] {
  const missing = new Set<unknown>();
  for (const controller of controllers) {
    for (const token of constructorTokensOf(controller)) {
      if (token === undefined || token === Object || busTokens.has(token) || provided.has(token)) continue;
      missing.add(token);
    }
  }
  return [...missing].map((token) => {
    assert.ok(typeof token === 'function' || typeof token === 'string' || typeof token === 'symbol', 'unexpected injection token');
    return { provide: token, useValue: unreachable(nameOf(token), reached) };
  });
}

type Middleware = (request: Request, response: Response, next: NextFunction) => void;

function rootModule(options: { controllers: Type<unknown>[]; providers: Provider[]; middleware: Middleware[] }): DynamicModule {
  @Module({})
  class ApiRouteTestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      // The order of AppModule.configure: correlation, security headers, Host/Origin, access log.
      consumer.apply(...options.middleware).forRoutes('{*splat}');
    }
  }
  return { module: ApiRouteTestModule, imports: [CqrsModule.forRoot()], controllers: options.controllers, providers: options.providers };
}

function sendTo(port: number, request: ApiRequest): Promise<ApiResponse> {
  const body = request.body ?? '';
  const headers: Record<string, string> = { host: API_HOST, connection: 'close', ...request.headers };
  if (body.length > 0) headers['content-length'] = String(Buffer.byteLength(body));
  return new Promise((resolveResponse, reject) => {
    const outgoing = httpRequest({ host: LOOPBACK_HOST, port, method: request.method ?? 'GET', path: request.path, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => resolveResponse({ status: incoming.statusCode ?? 0, headers: incoming.headers, text: Buffer.concat(chunks).toString('utf8') }));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

/**
 * Boots the named controllers behind the production http pipeline on 127.0.0.1 and an ephemeral
 * port. Session state and the passphrase check are the real api classes over the temp database.
 */
export async function startApi(home: ApiTestHome, options: ApiAppOptions): Promise<RunningApi> {
  const config = new ApiConfig(DEFAULT_API_PORT, DEFAULT_WEB_ORIGIN);
  const context = new RequestContext();
  const sessions = new SessionStore();
  const auth = new AuthService(new PassphraseVerifier(new PassphraseHashRepository(home.prisma)), new LoginThrottle(), sessions, context);
  const reached: string[] = [];
  const controllers = [...options.controllers];
  for (const controller of controllers) declareControllerTokens(controller);
  const providers: Provider[] = [
    { provide: ApiConfig, useValue: config },
    { provide: RequestContext, useValue: context },
    { provide: SessionStore, useValue: sessions },
    { provide: AuthService, useValue: auth },
    { provide: DataHome, useValue: home.dataHome },
    { provide: HealthService, useValue: new HealthService(home.prisma) },
    { provide: UNREACHABLE_TOKEN, useValue: unreachable('placeholder', reached) },
    { provide: APP_GUARD, useValue: new SessionGuard(new Reflector(), sessions, context) },
    { provide: APP_FILTER, useValue: new ApiExceptionFilter(context) },
    ...(options.providers ?? []),
  ];
  providers.push(...standInsFor(controllers, new Set(providers.map(tokenOf)), reached));
  const middleware = [new CorrelationMiddleware(context), new SecurityHeadersMiddleware(), new HostOriginMiddleware(config, context), new AccessLogMiddleware(context)];
  const app = await NestFactory.create<NestExpressApplication>(rootModule({ controllers, providers, middleware: middleware.map((each): Middleware => (request, response, next) => each.use(request, response, next)) }), {
    bodyParser: false,
    logger: false,
    abortOnError: false,
  });
  // As main.ts: one JSON parser with the 1 MB limit, no x-powered-by, no proxy trust, no ETag.
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.set('etag', false);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  await app.listen(0, LOOPBACK_HOST);
  const address: AddressInfo | string | null = app.getHttpServer().address();
  assert.ok(address !== null && typeof address !== 'string', 'the test api is listening on a TCP port');
  assert.equal(address.address, LOOPBACK_HOST, 'the test api is bound to loopback only');
  let closed = false;
  return {
    port: address.port,
    sessions,
    reached,
    send: (request) => sendTo(address.port, request),
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await app.close();
    },
  };
}

/** A JSON request body with its content type. */
export function jsonRequest(method: string, path: string, value: unknown, headers: Readonly<Record<string, string>> = {}): ApiRequest {
  return { method, path, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) };
}

/** The response body as a JSON object; fails the test on anything else. */
export function jsonBody(response: ApiResponse): Record<string, unknown> {
  const parsed: unknown = JSON.parse(response.text);
  assert.ok(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed), `expected a JSON object body, got: ${response.text.slice(0, 200)}`);
  return Object.fromEntries(Object.entries(parsed));
}

/** The `studio_session=<token>` pair a login response sets; fails the test when absent. */
export function sessionCookieOf(response: ApiResponse): string {
  const header = (response.headers['set-cookie'] ?? []).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
  assert.ok(header !== undefined, 'the response sets the session cookie');
  return header.split(';')[0] ?? '';
}

/** Logs in through the real route with the sentinel passphrase and returns the cookie pair. */
export async function loginCookie(api: RunningApi): Promise<string> {
  const response = await api.send(jsonRequest('POST', '/auth/login', { passphrase: SENTINEL_PASSPHRASE }));
  assert.equal(response.status, 200, response.text);
  return sessionCookieOf(response);
}

/** A session cookie issued straight by the real SessionStore, with its session id. */
export function issuedSession(api: RunningApi): { cookie: string; sessionId: string } {
  const issued = api.sessions.issue(Date.now());
  return { cookie: `${SESSION_COOKIE_NAME}=${issued.token}`, sessionId: issued.sessionId };
}

const stackFramePattern = /\bat (?:async )?\S+ \(?\S+:\d+:\d+\)?/;
const internalTextPattern = /\b(?:select\s|insert\s+into|update\s+\S+\s+set|prisma|sqlite)\b/i;

/** A client-facing text carries no stack frame, path, query, library name or the sentinel. */
export function assertLeaksNothing(text: string, home: ApiTestHome): void {
  assert.doesNotMatch(text, stackFramePattern, 'a stack frame reached the client');
  assert.doesNotMatch(text, internalTextPattern, 'query or database text reached the client');
  assert.equal(text.includes(home.root), false, 'a temp path reached the client');
  assert.equal(text.includes(REPOSITORY_ROOT), false, 'a source path reached the client');
  assert.equal(text.includes('node_modules'), false, 'a library path reached the client');
  assert.equal(text.includes(SENTINEL_PASSPHRASE), false, 'the sentinel passphrase reached the client');
}

export interface FixtureRunOptions {
  /** The run folder name under `<data home>/runs`. */
  folderRunId: RunId;
  /** The `runId` written inside run.json; defaults to the folder's. */
  fileRunId?: RunId;
  state?: RunState;
}

/** Writes the watcher's product-tour run.json into the temp data home through the C5 writer. */
export async function writeFixtureRun(home: ApiTestHome, options: FixtureRunOptions): Promise<string> {
  const fixture = await readRunFile(FIXTURE_RUN_DIRECTORY);
  const runDir = runDirectory(home.dataHome.runs, options.folderRunId);
  await mkdir(runDir, { recursive: true });
  await writeRunFile(runDir, { ...fixture, runId: options.fileRunId ?? options.folderRunId, state: options.state ?? fixture.state });
  return runDir;
}
