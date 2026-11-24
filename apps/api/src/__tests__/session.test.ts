import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SESSION_COOKIE_NAME } from '@studio/shared/api';
import { AppModule } from '../app.module';
import { IS_PUBLIC_ROUTE } from '../auth/auth.decorators';
import { MAX_FAILED_LOGINS } from '../auth/login-throttle';
import {
  SENTINEL_PASSPHRASE,
  assertLeaksNothing,
  createApiTestHome,
  jsonBody,
  jsonRequest,
  loginCookie,
  sessionCookieOf,
  startApi,
  type ApiRequest,
  type ApiTestHome,
  type RunningApi,
} from './api-test-home';

/*
 * Ticket 09 AC1 (CR11): every route that needs a session refuses a request without one. The route
 * list is read from the composition root (`AppModule` and every module it imports), so a route
 * added later is covered without editing this file. Every controller is mounted behind the real
 * middleware chain and the real global SessionGuard; collaborators are unreachable stand-ins, so a
 * 401 also proves no handler ran. The session lifecycle (login, cookie flags, logout, fixation,
 * throttle) runs through the real auth classes over the temp database's argon2id hash.
 */

interface RouteRow {
  route: string;
  method: string;
  path: string;
  isPublic: boolean;
}

function isType(value: unknown): value is Type<unknown> {
  return typeof value === 'function';
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Every controller reachable from the root module's static and dynamic imports. */
function controllersOf(root: Type<unknown>): Type<unknown>[] {
  const visited = new Set<unknown>();
  const controllers = new Set<Type<unknown>>();
  const collect = (value: unknown): void => {
    for (const controller of listOf(value)) if (isType(controller)) controllers.add(controller);
  };
  const visit = (entry: unknown): void => {
    if (entry === null || entry === undefined || visited.has(entry)) return;
    visited.add(entry);
    if (isType(entry)) {
      collect(Reflect.getMetadata('controllers', entry));
      for (const child of listOf(Reflect.getMetadata('imports', entry))) visit(child);
      return;
    }
    assert.ok(typeof entry === 'object', 'unexpected module import shape');
    assert.equal('forwardRef' in entry, false, 'a forwardRef import is not walked by this test');
    if ('module' in entry) visit(entry.module);
    if ('controllers' in entry) collect(entry.controllers);
    if ('imports' in entry) for (const child of listOf(entry.imports)) visit(child);
  };
  visit(root);
  return [...controllers];
}

function pathsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  const paths = listOf(value).filter((path): path is string => typeof path === 'string');
  return paths.length > 0 ? paths : [''];
}

function joinPath(...parts: string[]): string {
  const segments = parts.flatMap((part) => part.split('/')).filter((segment) => segment !== '');
  return `/${segments.join('/')}`;
}

function routesOf(controller: Type<unknown>): RouteRow[] {
  const rows: RouteRow[] = [];
  const controllerPublic = Reflect.getMetadata(IS_PUBLIC_ROUTE, controller) === true;
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    if (name === 'constructor') continue;
    const handler: unknown = Object.getOwnPropertyDescriptor(controller.prototype, name)?.value;
    if (typeof handler !== 'function') continue;
    const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
    if (typeof method !== 'number') continue;
    const isPublic = controllerPublic || Reflect.getMetadata(IS_PUBLIC_ROUTE, handler) === true;
    for (const base of pathsOf(Reflect.getMetadata(PATH_METADATA, controller))) {
      for (const own of pathsOf(Reflect.getMetadata(PATH_METADATA, handler))) {
        const template = joinPath(base, own);
        const verb = RequestMethod[method];
        // The guard runs before any pipe, so a placeholder value reaches no validation.
        const path = template.replace(/:[A-Za-z]+/g, 'sample-value');
        rows.push({ route: `${verb} ${template}`, method: verb, path, isPublic });
      }
    }
  }
  return rows;
}

const appControllers = controllersOf(AppModule);
const appRoutes: RouteRow[] = appControllers.flatMap(routesOf);
const guardedRoutes = appRoutes.filter((row) => !row.isPublic);

function requestFor(row: RouteRow, cookie: string | null): ApiRequest {
  const headers: Record<string, string> = cookie === null ? {} : { cookie };
  if (row.method === 'GET' || row.method === 'HEAD') return { method: row.method, path: row.path, headers };
  return jsonRequest(row.method, row.path, {}, headers);
}

describe('api session: every guarded route needs a session (ticket 09 AC1, CR11)', () => {
  let home: ApiTestHome;
  let api: RunningApi | null = null;

  beforeEach(async () => {
    home = await createApiTestHome('api-session');
    api = await startApi(home, { controllers: appControllers });
  });

  afterEach(async () => {
    await api?.close();
    api = null;
    await home.close();
  });

  function running(): RunningApi {
    assert.ok(api !== null);
    return api;
  }

  it('reads the full route table from AppModule, including routes of every feature module', () => {
    const routes = appRoutes.map((row) => row.route);
    for (const expected of [
      'GET /runs',
      'POST /runs/:runId/control',
      'GET /runs/:runId/artifact',
      'GET /watcher',
      'POST /catalog/assets/by-reference',
      'GET /platforms/:platform/connection/callback',
      'POST /auth/logout',
    ]) {
      assert.ok(routes.includes(expected), `missing ${expected}`);
    }
    assert.ok(appControllers.length >= 20, `found ${appControllers.length} controllers`);
  });

  it('marks exactly GET /health and POST /auth/login public (criterion 27)', () => {
    assert.deepEqual(appRoutes.filter((row) => row.isPublic).map((row) => row.route).sort(), ['GET /health', 'POST /auth/login']);
  });

  it('answers 401 auth/unauthenticated on every guarded route without a cookie, before any handler runs', async () => {
    const mismatches: string[] = [];
    for (const row of guardedRoutes) {
      const response = await running().send(requestFor(row, null));
      const body = response.status === 401 ? jsonBody(response) : {};
      if (response.status !== 401 || body.code !== 'auth' || body.reason !== 'unauthenticated') mismatches.push(`${row.route} -> ${response.status}`);
      assertLeaksNothing(response.text, home);
    }
    assert.deepEqual(mismatches, []);
    assert.deepEqual(running().reached, [], 'a collaborator was reached without a session');
  });

  it('answers 401 on every guarded route with a well-formed but forged session cookie', async () => {
    const forged = `${SESSION_COOKIE_NAME}=${'A'.repeat(22)}.${'B'.repeat(43)}`;
    const mismatches: string[] = [];
    for (const row of guardedRoutes) {
      const response = await running().send(requestFor(row, forged));
      if (response.status !== 401) mismatches.push(`${row.route} -> ${response.status}`);
    }
    assert.deepEqual(mismatches, []);
    assert.deepEqual(running().reached, []);
  });

  it('answers 401 when the cookie carries a malformed token', async () => {
    const response = await running().send({ path: '/auth/session', headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-token` } });
    assert.equal(response.status, 401);
  });

  it('serves GET /health without a session, so the refusals above come from the guard', async () => {
    const response = await running().send({ path: '/health' });
    assert.equal(response.status, 200);
    assert.deepEqual(jsonBody(response), { status: 'ok', database: 'ok' });
  });

  it('logs in with the stored passphrase and sets an HttpOnly, SameSite=Lax, path-wide 12 h cookie', async () => {
    const response = await running().send(jsonRequest('POST', '/auth/login', { passphrase: SENTINEL_PASSPHRASE }));

    assert.equal(response.status, 200);
    assert.equal(jsonBody(response).authenticated, true);
    const header = (response.headers['set-cookie'] ?? []).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
    const flags = header.split(';').slice(1).map((flag) => flag.trim());
    assert.deepEqual(flags.sort(), ['HttpOnly', 'Max-Age=43200', 'Path=/', 'SameSite=Lax']);
    const session = await running().send({ path: '/auth/session', headers: { cookie: sessionCookieOf(response) } });
    assert.equal(session.status, 200);
    assert.equal(jsonBody(session).authenticated, true);
  });

  it('refuses a wrong passphrase with 401 invalid-passphrase, no cookie and no echo of the input', async () => {
    const attempt = 'wrong-passphrase-0d93aa';
    const response = await running().send(jsonRequest('POST', '/auth/login', { passphrase: attempt }));

    assert.equal(response.status, 401);
    assert.equal(jsonBody(response).reason, 'invalid-passphrase');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.text.includes(attempt), false);
    assert.equal(home.logs.text().includes(attempt), false, 'the attempted passphrase was logged');
    assertLeaksNothing(response.text, home);
  });

  it('ends the session on logout: 204, a cleared cookie, and the old cookie answers 401', async () => {
    const cookie = await loginCookie(running());

    const logout = await running().send({ method: 'POST', path: '/auth/logout', headers: { cookie } });

    assert.equal(logout.status, 204);
    const cleared = (logout.headers['set-cookie'] ?? []).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
    assert.match(cleared, /Max-Age=0/);
    assert.equal((await running().send({ path: '/auth/session', headers: { cookie } })).status, 401);
  });

  it('revokes the session the browser presented when it logs in again (no fixation)', async () => {
    const first = await loginCookie(running());

    const second = await running().send(jsonRequest('POST', '/auth/login', { passphrase: SENTINEL_PASSPHRASE }, { cookie: first }));

    assert.equal(second.status, 200);
    const renewed = sessionCookieOf(second);
    assert.notEqual(renewed, first);
    assert.equal((await running().send({ path: '/auth/session', headers: { cookie: first } })).status, 401);
    assert.equal((await running().send({ path: '/auth/session', headers: { cookie: renewed } })).status, 200);
  });

  it(`answers 429 rate_limited with Retry-After after ${MAX_FAILED_LOGINS} failures, even for the right passphrase`, async () => {
    for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      assert.equal((await running().send(jsonRequest('POST', '/auth/login', { passphrase: `wrong-${attempt}` }))).status, 401);
    }

    const limited = await running().send(jsonRequest('POST', '/auth/login', { passphrase: SENTINEL_PASSPHRASE }));

    assert.equal(limited.status, 429);
    assert.equal(jsonBody(limited).code, 'rate_limited');
    const retryAfter = Number.parseInt(String(limited.headers['retry-after']), 10);
    assert.ok(retryAfter >= 1 && retryAfter <= 15 * 60, `Retry-After ${String(limited.headers['retry-after'])}`);
    assert.equal(limited.headers['set-cookie'], undefined);
  });

  it('keeps the passphrase and the session token out of every log line', async () => {
    const cookie = await loginCookie(running());
    await running().send({ path: '/auth/session', headers: { cookie } });

    const logs = home.logs.text();
    assert.ok(logs.length > 0, 'the access log recorded the requests');
    assert.equal(logs.includes(SENTINEL_PASSPHRASE), false);
    assert.equal(logs.includes(cookie.slice(`${SESSION_COOKIE_NAME}=`.length)), false);
  });
});
