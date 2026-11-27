import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { REQUEST_ID_HEADER } from '@studio/shared/api';
import { AuthController } from '../auth/auth.controller';
import { RunDecisionsController } from '../runs/run-decisions.controller';
import { RunsController } from '../runs/runs.controller';
import {
  FIXTURE_RUN_ID,
  SENTINEL_PASSPHRASE,
  assertLeaksNothing,
  createApiTestHome,
  issuedSession,
  jsonBody,
  jsonRequest,
  startApi,
  type ApiResponse,
  type ApiTestHome,
  type RunningApi,
} from './api-test-home';

/*
 * Ticket 09 AC3 (CR11): oversized bodies and invalid fields are refused with a client error whose
 * body carries no stack, query, path or echo of the input. The real JSON body limit of main.ts,
 * the real ZodValidationPipe and the real ApiExceptionFilter answer; collaborators behind the
 * routes are unreachable stand-ins, so every refusal also proves no handler ran.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The C10 issue shape a validation refusal may carry: a path and a zod code, never a value. */
function issuesOf(response: ApiResponse): Record<string, unknown>[] {
  const details = jsonBody(response).details;
  assert.ok(typeof details === 'object' && details !== null && 'issues' in details && Array.isArray(details.issues), 'a validation refusal lists its issues');
  return details.issues.map((issue: unknown) => {
    assert.ok(typeof issue === 'object' && issue !== null);
    return Object.fromEntries(Object.entries(issue));
  });
}

describe('api validation: invalid input is refused without leaking (ticket 09 AC3, CR11)', () => {
  let home: ApiTestHome;
  let api: RunningApi | null = null;
  let cookie: string;

  beforeEach(async () => {
    home = await createApiTestHome('api-validation');
    api = await startApi(home, { controllers: [AuthController, RunDecisionsController, RunsController] });
    cookie = issuedSession(api).cookie;
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

  describe('request bodies', () => {
    it('refuses a JSON body over the 1 MB limit with 413 and a body that leaks nothing', async () => {
      const marker = 'oversized-marker-7c41';
      const response = await running().send(jsonRequest('POST', '/auth/login', { passphrase: `${marker}${'a'.repeat(1_100_000)}` }));

      assert.equal(response.status, 413, `expected 413 payload-too-large, got ${response.status}: ${response.text.slice(0, 200)}`);
      assert.equal(jsonBody(response).statusCode, 413);
      assert.equal(response.text.includes(marker), false);
      assertLeaksNothing(response.text, home);
    });

    it('refuses malformed JSON with 400 and a fixed text that does not quote the body', async () => {
      const response = await running().send({
        method: 'POST',
        path: '/auth/login',
        headers: { 'content-type': 'application/json' },
        body: `{"passphrase": "${SENTINEL_PASSPHRASE}`,
      });

      assert.equal(response.status, 400);
      const body = jsonBody(response);
      assert.equal(body.code, 'validation');
      assert.equal(body.message, 'Request failed with status 400');
      assertLeaksNothing(response.text, home);
      assert.equal(home.logs.text().includes(SENTINEL_PASSPHRASE), false, 'the malformed body was logged');
    });

    it('refuses a login body with an unknown field with 400 invalid-request, reporting only path and code', async () => {
      const response = await running().send(jsonRequest('POST', '/auth/login', { passphrase: 'value-a1', role: 'admin-value-b2' }));

      assert.equal(response.status, 400);
      assert.equal(jsonBody(response).reason, 'invalid-request');
      for (const issue of issuesOf(response)) assert.deepEqual(Object.keys(issue).sort(), ['code', 'path']);
      assert.equal(response.text.includes('admin-value-b2'), false);
      assert.equal(response.text.includes('value-a1'), false);
    });

    it('refuses a passphrase longer than 1024 characters with 400 and never echoes or logs it', async () => {
      const marker = 'long-passphrase-marker-93fe';
      const response = await running().send(jsonRequest('POST', '/auth/login', { passphrase: `${marker}${'z'.repeat(1024)}` }));

      assert.equal(response.status, 400);
      assert.equal(jsonBody(response).reason, 'invalid-request');
      assert.equal(response.text.includes(marker), false);
      assert.equal(home.logs.text().includes(marker), false);
    });

    it('refuses a passphrase of the wrong type with 400', async () => {
      const response = await running().send(jsonRequest('POST', '/auth/login', { passphrase: 12345 }));

      assert.equal(response.status, 400);
      assert.deepEqual(issuesOf(response).map((issue) => issue.path), ['passphrase']);
    });

    it('refuses a control request with an unknown kind with 400 before any collaborator runs', async () => {
      const response = await running().send(jsonRequest('POST', `/runs/${FIXTURE_RUN_ID}/control`, { kind: 'delete' }, { cookie }));

      assert.equal(response.status, 400);
      assert.equal(jsonBody(response).reason, 'invalid-request');
      assert.deepEqual(running().reached, []);
    });
  });

  describe('path and query parameters', () => {
    it('refuses a run id that is not a ULID with 400', async () => {
      const response = await running().send(jsonRequest('POST', '/runs/not-a-ulid/control', { kind: 'pause' }, { cookie }));

      assert.equal(response.status, 400);
      assert.equal(jsonBody(response).reason, 'invalid-request');
      assert.deepEqual(running().reached, []);
    });

    const refusedArtifactQueries: ReadonlyArray<readonly [label: string, query: string]> = [
      ['a parent segment', 'path=..%2Frun.json'],
      ['a bare parent segment', 'path=..'],
      ['an absolute path', 'path=%2Fetc%2Fpasswd'],
      ['a backslash path', 'path=qa%5C..%5Crun.json'],
      ['a repeated parameter', 'path=report.md&path=final.mp4'],
      ['an unknown parameter', 'path=report.md&download=1'],
    ];
    for (const [label, query] of refusedArtifactQueries) {
      it(`refuses an artifact query with ${label} with 400 before any file is touched`, async () => {
        const response = await running().send({ path: `/runs/${FIXTURE_RUN_ID}/artifact?${query}`, headers: { cookie } });

        assert.equal(response.status, 400);
        assert.equal(jsonBody(response).reason, 'invalid-request');
        assert.deepEqual(running().reached, [], 'the artifact reader was reached');
        assertLeaksNothing(response.text, home);
      });
    }
  });

  describe('x-request-id', () => {
    it('echoes a supplied request id that matches the correlation id allowlist', async () => {
      const response = await running().send({ path: '/auth/session', headers: { cookie, [REQUEST_ID_HEADER]: 'req-123.abc:9' } });

      assert.equal(response.headers[REQUEST_ID_HEADER], 'req-123.abc:9');
      assert.equal(jsonBody(response).authenticated, true);
    });

    it('replaces a request id outside the allowlist with a fresh one and never echoes it', async () => {
      const supplied = '<script>alert(1)</script>';

      const response = await running().send({ path: '/auth/session', headers: { [REQUEST_ID_HEADER]: supplied } });

      assert.equal(response.status, 401);
      const echoed = response.headers[REQUEST_ID_HEADER];
      assert.ok(typeof echoed === 'string' && UUID_PATTERN.test(echoed), `x-request-id ${String(echoed)}`);
      assert.equal(jsonBody(response).correlationId, echoed);
      assert.equal(response.text.includes(supplied), false);
    });
  });
});
