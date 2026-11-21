import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { SESSION_COOKIE_NAME } from '@studio/shared/api';
import { ConnectionCallbackController } from '../connections/connection-callback.controller';
import { PlatformsController } from '../connections/platforms.controller';
import { UnauthenticatedError } from '../platform/api.errors';
import { mapError } from '../platform/error-mapping';
import { RequestContext } from '../platform/request-context';
import { PublishingController } from '../publishing/publishing.controller';
import { IS_PUBLIC_ROUTE } from './auth.decorators';
import { AuthModule } from './auth.module';
import { SessionGuard } from './session.guard';
import { SessionStore } from './session-store';

/*
 * AC 62 (SPEC 0007 section 6 "Authorization", D8): every C10 rev 7 route answers 401 without a
 * session. The proof is the route metadata of the three rev 7 controllers (no `@Public()`, exactly
 * the eight rows of section 4.4) plus the real global `SessionGuard` run against each handler.
 * The BFF table half of AC 62 lives in apps/web; the insights half in core.
 */

type RouteHandler = NonNullable<ConstructorParameters<typeof ExecutionContextHost>[2]>;

interface RouteRow {
  route: string;
  controller: Type<unknown>;
  handler: RouteHandler;
}

const rev7Controllers: Type<unknown>[] = [PlatformsController, ConnectionCallbackController, PublishingController];

/** Section 4.4, typed out from the frozen spec. */
const specRoutes = [
  'GET /platforms',
  'PATCH /platforms/:platform/gate',
  'POST /platforms/:platform/connection',
  'GET /platforms/:platform/connection/callback',
  'DELETE /platforms/:platform/connection',
  'GET /runs/:runId/publish',
  'POST /runs/:runId/publish/:platform',
  'DELETE /runs/:runId/publish/attempts/:attemptId',
];

function pathText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function joinPath(...parts: string[]): string {
  const segments = parts.flatMap((part) => part.split('/')).filter((segment) => segment !== '');
  return `/${segments.join('/')}`;
}

function routesOf(controller: Type<unknown>): RouteRow[] {
  const base = pathText(Reflect.getMetadata(PATH_METADATA, controller));
  const rows: RouteRow[] = [];
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    if (name === 'constructor') continue;
    const handler: unknown = Object.getOwnPropertyDescriptor(controller.prototype, name)?.value;
    if (typeof handler !== 'function') continue;
    const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
    if (typeof method !== 'number') continue;
    rows.push({ route: `${RequestMethod[method]} ${joinPath(base, pathText(Reflect.getMetadata(PATH_METADATA, handler)))}`, controller, handler });
  }
  return rows;
}

const rev7Routes: RouteRow[] = rev7Controllers.flatMap(routesOf);

function guardWith(sessions: SessionStore): SessionGuard {
  return new SessionGuard(new Reflector(), sessions, new RequestContext());
}

function executionFor(row: RouteRow, cookie: string | undefined): ExecutionContextHost {
  const headers = cookie === undefined ? {} : { cookie };
  return new ExecutionContextHost([{ headers }, {}, () => undefined], row.controller, row.handler);
}

function refusalOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return assert.fail('the guard let the request through');
}

describe('C10 rev 7 routes need the passphrase session (AC 62)', () => {
  it('declares exactly the eight rev 7 routes of section 4.4', () => {
    assert.deepEqual(rev7Routes.map((row) => row.route).sort(), [...specRoutes].sort());
  });

  it('marks no rev 7 controller or handler @Public()', () => {
    for (const controller of rev7Controllers) assert.equal(Reflect.getMetadata(IS_PUBLIC_ROUTE, controller), undefined, controller.name);
    for (const row of rev7Routes) assert.equal(Reflect.getMetadata(IS_PUBLIC_ROUTE, row.handler), undefined, row.route);
  });

  it('registers SessionGuard as the global guard', () => {
    const providers: unknown = Reflect.getMetadata('providers', AuthModule);
    assert.ok(Array.isArray(providers));
    assert.ok(providers.some((provider: unknown) => typeof provider === 'object' && provider !== null && 'provide' in provider && provider.provide === APP_GUARD && 'useClass' in provider && provider.useClass === SessionGuard));
  });

  for (const row of rev7Routes) {
    it(`answers 401 on ${row.route} without a session cookie`, () => {
      const error = refusalOf(() => guardWith(new SessionStore()).canActivate(executionFor(row, undefined)));
      assert.ok(error instanceof UnauthenticatedError);
      assert.equal(mapError(error).statusCode, 401);
    });

    it(`answers 401 on ${row.route} with a forged session cookie`, () => {
      const forged = `${SESSION_COOKIE_NAME}=${'A'.repeat(22)}.${'B'.repeat(43)}`;
      const error = refusalOf(() => guardWith(new SessionStore()).canActivate(executionFor(row, forged)));
      assert.ok(error instanceof UnauthenticatedError);
    });
  }

  it('lets a rev 7 route through with a valid session, so the refusals above come from the missing session', () => {
    const sessions = new SessionStore();
    const issued = sessions.issue(Date.now());
    const [row] = rev7Routes;
    assert.ok(row !== undefined);
    assert.equal(guardWith(sessions).canActivate(executionFor(row, `${SESSION_COOKIE_NAME}=${issued.token}`)), true);
  });
});
