import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { HEADERS_METADATA, REDIRECT_METADATA } from '@nestjs/common/constants';
import { CompleteConnectionCommand, PlatformRefusedError } from '@studio/core/platforms';
import { ApiConfig } from '../platform/api-config';
import { RequestContext } from '../platform/request-context';
import { ConnectionCallbackController } from './connection-callback.controller';
import { API_PORT, WEB_ORIGIN, principal, startRev7Bus, type Rev7Bus } from './rev7-bus.harness.test';

/*
 * AC 40 and SPEC 0007 section 5.2 step 2 / section 6 "Callback": a malformed callback runs no
 * command, so nothing is consumed or stored; a core refusal answers 303 to `/contas` with a reason
 * id only; the answer is never cached and never sent as a `Referer`; `connectedBy` and the session
 * binding come from the principal. Core's own `state` checks are proven in packages/core.
 */

const STATE = 'Zm9vYmFyU3RhdGVWYWx1ZTEyMzQ1Njc4';
const CODE = '4/0AsentinelAuthorizationCode-91c2';
const PLATFORM_ERROR_TEXT = 'The+user+denied+access+to+sentinel';

function searchOf(url: string): Record<string, string> {
  const parsed = new URL(url);
  assert.equal(parsed.origin, WEB_ORIGIN);
  assert.equal(parsed.pathname, '/contas');
  return Object.fromEntries(parsed.searchParams.entries());
}

function headersOf(handler: object): Record<string, string> {
  const headers: unknown = Reflect.getMetadata(HEADERS_METADATA, handler);
  assert.ok(Array.isArray(headers));
  const entries: [string, string][] = [];
  for (const header of headers) {
    if (typeof header === 'object' && header !== null && 'name' in header && 'value' in header && typeof header.name === 'string' && typeof header.value === 'string') {
      entries.push([header.name.toLowerCase(), header.value]);
    }
  }
  return Object.fromEntries(entries);
}

function completeCommands(bus: Rev7Bus): CompleteConnectionCommand[] {
  return bus.core.received.filter((message) => message instanceof CompleteConnectionCommand);
}

describe('GET /platforms/:platform/connection/callback (AC 40)', () => {
  let bus: Rev7Bus;
  let controller: ConnectionCallbackController;

  beforeEach(async () => {
    bus = await startRev7Bus();
    controller = new ConnectionCallbackController(bus.commandBus, new ApiConfig(API_PORT, WEB_ORIGIN), new RequestContext());
  });

  afterEach(async () => {
    await bus.close();
  });

  const malformedQueries: { name: string; query: Record<string, unknown> }[] = [
    { name: 'a repeated state parameter', query: { code: CODE, state: [STATE, STATE] } },
    { name: 'a state shorter than 16 characters', query: { code: CODE, state: 'short' } },
    { name: 'a state with characters outside base64url', query: { code: CODE, state: `${STATE}<script>` } },
    { name: 'a code with a space', query: { code: 'has a space', state: STATE } },
    { name: 'an empty error parameter', query: { state: STATE, error: '' } },
  ];

  for (const { name, query } of malformedQueries) {
    it(`runs no command for ${name} and answers 303 with oauth-state-invalid`, async () => {
      const redirect = await controller.complete({ platform: 'youtube' }, query, principal);

      assert.equal(bus.core.received.length, 0);
      assert.equal(redirect.statusCode, 303);
      assert.deepEqual(searchOf(redirect.url), { resultado: 'falhou', motivo: 'oauth-state-invalid' });
    });
  }

  it('redirects a core refusal with its reason id only, never the code, the state or platform text', async () => {
    bus.core.completeConnection = () => Promise.reject(new PlatformRefusedError('oauth-state-invalid', 'youtube'));

    const redirect = await controller.complete({ platform: 'youtube' }, { code: CODE, state: STATE, error_description: PLATFORM_ERROR_TEXT }, principal);

    assert.equal(completeCommands(bus).length, 1);
    assert.equal(redirect.statusCode, 303);
    assert.deepEqual(searchOf(redirect.url), { resultado: 'falhou', motivo: 'oauth-state-invalid' });
    for (const secret of [CODE, STATE, PLATFORM_ERROR_TEXT]) {
      assert.equal(redirect.url.includes(secret), false, 'the redirect leaks a callback value');
      assert.equal(bus.logs.text().includes(secret), false, 'a log line leaks a callback value');
    }
  });

  it('hands the platform error to core and redirects oauth-denied', async () => {
    bus.core.completeConnection = () => Promise.reject(new PlatformRefusedError('oauth-denied', 'tiktok'));

    const redirect = await controller.complete({ platform: 'tiktok' }, { state: STATE, error: 'access_denied' }, principal);

    const [command] = completeCommands(bus);
    assert.ok(command !== undefined);
    assert.equal(command.input.error, 'access_denied');
    assert.equal(command.input.code, null);
    assert.deepEqual(searchOf(redirect.url), { resultado: 'falhou', motivo: 'oauth-denied' });
  });

  it('redirects an unanticipated failure without a reason and logs the error name only', async () => {
    bus.core.completeConnection = () => Promise.reject(new Error('cannot write /Users/owner/.video-studio/platform/youtube/account.json'));

    const redirect = await controller.complete({ platform: 'youtube' }, { code: CODE, state: STATE }, principal);

    assert.deepEqual(searchOf(redirect.url), { resultado: 'falhou' });
    assert.equal(bus.logs.text().includes('account.json'), false);
  });

  it('redirects a completed connection to conectada with no id in the address', async () => {
    bus.core.completeConnection = async (command) => ({ platform: command.input.platform, connectionId: '01JDA700000000000000000CN1' });

    const redirect = await controller.complete({ platform: 'youtube' }, { code: CODE, state: STATE }, principal);

    assert.equal(redirect.statusCode, 303);
    assert.deepEqual(searchOf(redirect.url), { resultado: 'conectada' });
  });

  it('takes connectedBy and the session binding from the principal and drops every other parameter', async () => {
    bus.core.completeConnection = async (command) => ({ platform: command.input.platform, connectionId: '01JDA700000000000000000CN1' });

    await controller.complete(
      { platform: 'youtube' },
      { code: CODE, state: STATE, connectedBy: 'attacker', sessionId: 'someone-else', apiPort: '80', scope: 'youtube.upload' },
      principal,
    );

    const [command] = completeCommands(bus);
    assert.ok(command !== undefined);
    assert.deepEqual(command.input, {
      platform: 'youtube',
      sessionId: principal.sessionId,
      apiPort: API_PORT,
      code: CODE,
      state: STATE,
      error: null,
      connectedBy: principal.subject,
      correlationId: null,
    });
  });

  it('answers with Cache-Control no-store and Referrer-Policy no-referrer as a redirect', () => {
    const handler = ConnectionCallbackController.prototype.complete;
    const headers = headersOf(handler);
    assert.equal(headers['cache-control'], 'no-store');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.notEqual(Reflect.getMetadata(REDIRECT_METADATA, handler), undefined);
  });
});
