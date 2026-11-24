import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { GetAssetVersionQuery } from '@studio/core/catalog';
import { CompleteConnectionCommand } from '@studio/core/platforms';
import { type Sensitivity } from '@studio/shared/catalog';
import { type RunId } from '@studio/shared/run-format';
import { AuthController } from '../auth/auth.controller';
import { ConnectionCallbackController } from '../connections/connection-callback.controller';
import { DEFAULT_WEB_ORIGIN } from '../platform/api-config';
import { RequestContext } from '../platform/request-context';
import { RunArtifactAccessService } from '../runs/run-artifact-access.service';
import { RunArtifactReader } from '../runs/run-artifact.reader';
import { RunsController } from '../runs/runs.controller';
import {
  FIXTURE_RUN_ID,
  assertLeaksNothing,
  createApiTestHome,
  issuedSession,
  jsonBody,
  startApi,
  writeFixtureRun,
  type ApiResponse,
  type ApiTestHome,
  type RunningApi,
} from './api-test-home';

/*
 * Ticket 09 AC2 (CR11): a request for an object that is not the caller's is refused where the route
 * has an object-level check. The studio has one owner, so "another owner's object" is, per route:
 * - sessions: one browser's logout never ends another browser's session;
 * - the OAuth callback: core is always given the calling session's id, never a client-supplied one,
 *   so a `state` bound to another session cannot be completed (core checks the binding);
 * - run artifacts: a file of another run reached through a link, a run.json naming another run, or a
 *   biometric run's other media are refused as not found;
 * - the Host/Origin boundary: a foreign host or a cross-site write never reaches a route.
 * Core's sensitivity lookup and connection completion are stand-in CQRS handlers on the real bus.
 */

const OTHER_RUN_ID: RunId = '01JD2Q7F3M8V5K9X4T6R2N0B2D';
const CALLBACK_STATE = 'state_0123456789abcdef';

/** What the stand-in `GetAssetVersionQuery` handler answers and what it was asked. */
class AssetLookups {
  biometric: ReadonlySet<string> = new Set();
  unknown: ReadonlySet<string> = new Set();
  readonly asked: string[] = [];

  reset(): void {
    this.biometric = new Set();
    this.unknown = new Set();
    this.asked.length = 0;
  }
}

class AssetVersionUnknownError extends Error {
  constructor(ref: string) {
    super(`No asset version ${ref}`);
    this.name = 'AssetVersionUnknownError';
  }
}

const assetLookups = new AssetLookups();
const completions: CompleteConnectionCommand['input'][] = [];

@QueryHandler(GetAssetVersionQuery)
class StandInAssetVersionHandler {
  execute(query: GetAssetVersionQuery): Promise<{ sensitivity: Sensitivity }> {
    assetLookups.asked.push(query.ref);
    if (assetLookups.unknown.has(query.ref)) return Promise.reject(new AssetVersionUnknownError(query.ref));
    return Promise.resolve({ sensitivity: assetLookups.biometric.has(query.ref) ? 'biometric' : 'normal' });
  }
}

@CommandHandler(CompleteConnectionCommand)
class StandInCompleteConnectionHandler {
  execute(command: CompleteConnectionCommand): Promise<void> {
    completions.push(command.input);
    return Promise.resolve();
  }
}

describe('api authorization: objects that are not the caller\'s are refused (ticket 09 AC2, CR11)', () => {
  let home: ApiTestHome;
  let api: RunningApi | null = null;

  beforeEach(async () => {
    home = await createApiTestHome('api-authorization');
    assetLookups.reset();
    completions.length = 0;
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

  describe('sessions and the Host/Origin boundary', () => {
    beforeEach(async () => {
      api = await startApi(home, { controllers: [AuthController] });
    });

    it('ends only the calling browser\'s session on logout; another session stays valid', async () => {
      const first = issuedSession(running());
      const second = issuedSession(running());

      const logout = await running().send({ method: 'POST', path: '/auth/logout', headers: { cookie: first.cookie } });

      assert.equal(logout.status, 204);
      assert.equal((await running().send({ path: '/auth/session', headers: { cookie: first.cookie } })).status, 401);
      assert.equal((await running().send({ path: '/auth/session', headers: { cookie: second.cookie } })).status, 200);
    });

    it('refuses a request whose Host is not the api\'s own (DNS rebinding) with 403, even with a session', async () => {
      const { cookie } = issuedSession(running());

      const response = await running().send({ path: '/auth/session', headers: { cookie, host: 'attacker.example:4311' } });

      assert.equal(response.status, 403);
      assert.equal(jsonBody(response).reason, 'host-not-allowed');
      assertLeaksNothing(response.text, home);
    });

    it('refuses a write from a foreign Origin with 403 and leaves the session in place', async () => {
      const { cookie } = issuedSession(running());

      const response = await running().send({ method: 'POST', path: '/auth/logout', headers: { cookie, origin: 'https://attacker.example' } });

      assert.equal(response.status, 403);
      assert.equal(jsonBody(response).reason, 'origin-not-allowed');
      assert.equal((await running().send({ path: '/auth/session', headers: { cookie } })).status, 200);
    });

    it('refuses a write the browser marks cross-site with 403', async () => {
      const { cookie } = issuedSession(running());

      const response = await running().send({ method: 'POST', path: '/auth/logout', headers: { cookie, 'sec-fetch-site': 'cross-site' } });

      assert.equal(response.status, 403);
      assert.equal(jsonBody(response).reason, 'cross-site-request');
    });

    it('accepts the same write from the web origin, so the refusals above come from the origin check', async () => {
      const { cookie } = issuedSession(running());

      const response = await running().send({ method: 'POST', path: '/auth/logout', headers: { cookie, origin: DEFAULT_WEB_ORIGIN, 'sec-fetch-site': 'same-site' } });

      assert.equal(response.status, 204);
    });
  });

  describe('GET /platforms/:platform/connection/callback', () => {
    beforeEach(async () => {
      api = await startApi(home, { controllers: [ConnectionCallbackController], providers: [StandInCompleteConnectionHandler] });
    });

    function callback(cookie: string, extraQuery: string): Promise<ApiResponse> {
      return running().send({ path: `/platforms/youtube/connection/callback?code=auth-code-1&state=${CALLBACK_STATE}${extraQuery}`, headers: { cookie } });
    }

    it('gives core the calling session\'s id and ignores a session id supplied in the query', async () => {
      const caller = issuedSession(running());
      const other = issuedSession(running());

      const response = await callback(caller.cookie, `&sessionId=${other.sessionId}`);

      assert.equal(response.status, 303);
      assert.equal(response.headers.location, `${DEFAULT_WEB_ORIGIN}/contas?resultado=conectada`);
      assert.equal(completions.length, 1);
      const [input] = completions;
      assert.equal(input?.sessionId, caller.sessionId);
      assert.equal(JSON.stringify(input).includes(other.sessionId), false, 'a client-supplied session id reached core');
    });

    it('binds each browser\'s callback to its own session', async () => {
      const first = issuedSession(running());
      const second = issuedSession(running());

      await callback(first.cookie, '');
      await callback(second.cookie, '');

      assert.deepEqual(completions.map((input) => input.sessionId), [first.sessionId, second.sessionId]);
    });

    it('runs no completion for a callback without a session', async () => {
      const response = await running().send({ path: `/platforms/youtube/connection/callback?code=auth-code-1&state=${CALLBACK_STATE}` });

      assert.equal(response.status, 401);
      assert.equal(completions.length, 0);
    });
  });

  describe('GET /runs/:runId/artifact', () => {
    let cookie: string;

    beforeEach(async () => {
      api = await startApi(home, {
        controllers: [RunsController],
        providers: [
          StandInAssetVersionHandler,
          {
            provide: RunArtifactAccessService,
            useFactory: (queryBus: QueryBus, context: RequestContext): RunArtifactAccessService => new RunArtifactAccessService(queryBus, home.dataHome, context),
            inject: [QueryBus, RequestContext],
          },
          { provide: RunArtifactReader, useValue: new RunArtifactReader(home.dataHome) },
        ],
      });
      cookie = issuedSession(running()).cookie;
    });

    function artifact(runId: RunId, path: string): Promise<ApiResponse> {
      return running().send({ path: `/runs/${runId}/artifact?path=${encodeURIComponent(path)}`, headers: { cookie } });
    }

    it('serves a run\'s own media file, so the refusals below come from the object checks', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      await mkdir(join(runDir, 'qa'));
      await writeFile(join(runDir, 'qa', 'clip.mp4'), 'own-clip-bytes');

      const response = await artifact(FIXTURE_RUN_ID, 'qa/clip.mp4');

      assert.equal(response.status, 200, response.text);
      assert.equal(response.text, 'own-clip-bytes');
    });

    it('refuses with 404 a file of another run reached through a link inside this run', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      const otherDir = await writeFixtureRun(home, { folderRunId: OTHER_RUN_ID });
      await writeFile(join(otherDir, 'final.mp4'), 'other-run-final-bytes');
      await mkdir(join(runDir, 'qa'));
      await symlink(join(otherDir, 'final.mp4'), join(runDir, 'qa', 'clip.mp4'));

      const response = await artifact(FIXTURE_RUN_ID, 'qa/clip.mp4');

      assert.equal(response.status, 404);
      assert.equal(jsonBody(response).reason, 'artifact-not-found');
      assert.equal(response.text.includes('other-run-final-bytes'), false);
      assertLeaksNothing(response.text, home);
    });

    it('refuses with 404 a link that leaves the data home', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      const outsideFile = join(home.outside, 'voice.wav');
      await writeFile(outsideFile, 'outside-bytes');
      await mkdir(join(runDir, 'qa'));
      await symlink(outsideFile, join(runDir, 'qa', 'voice.wav'));

      const response = await artifact(FIXTURE_RUN_ID, 'qa/voice.wav');

      assert.equal(response.status, 404);
      assert.equal(response.text.includes('outside-bytes'), false);
    });

    it('withholds media of a folder whose run.json names another run, but still serves its text', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID, fileRunId: OTHER_RUN_ID });
      await writeFile(join(runDir, 'final.mp4'), 'final-bytes');
      await writeFile(join(runDir, 'report.md'), '# report');

      const media = await artifact(FIXTURE_RUN_ID, 'final.mp4');
      const report = await artifact(FIXTURE_RUN_ID, 'report.md');

      assert.equal(media.status, 404);
      assert.equal(media.text.includes('final-bytes'), false);
      assert.equal(report.status, 200);
      assert.equal(report.text, '# report');
      assert.equal(home.logs.text().includes(home.root), false, 'the withhold log carries no path');
    });

    it('serves only final.mp4 of a run that uses a biometric asset and refuses its other media', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      assetLookups.biometric = new Set(['spesia-music-680@1']);
      await writeFile(join(runDir, 'final.mp4'), 'final-bytes');
      await mkdir(join(runDir, 'qa'));
      await writeFile(join(runDir, 'qa', 'clip.mp4'), 'clip-bytes');

      const final = await artifact(FIXTURE_RUN_ID, 'final.mp4');
      const clip = await artifact(FIXTURE_RUN_ID, 'qa/clip.mp4');

      assert.ok(assetLookups.asked.includes('spesia-music-680@1'), 'the fixture run binds the biometric ref');
      assert.equal(final.status, 200);
      assert.equal(final.text, 'final-bytes');
      assert.equal(clip.status, 404);
      assert.equal(clip.text.includes('clip-bytes'), false);
    });

    it('withholds media when a bound asset\'s sensitivity cannot be resolved (fail closed)', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      assetLookups.unknown = new Set(['spesia-music-680@1']);
      await writeFile(join(runDir, 'final.mp4'), 'final-bytes');

      const response = await artifact(FIXTURE_RUN_ID, 'final.mp4');

      assert.equal(response.status, 404);
      assert.equal(response.text.includes('final-bytes'), false);
    });

    it('answers 404 for a run folder that does not exist', async () => {
      const response = await artifact(OTHER_RUN_ID, 'report.md');

      assert.equal(response.status, 404);
      assert.equal((await readdir(home.dataHome.runs)).includes(OTHER_RUN_ID), false, 'no run folder was created');
      assertLeaksNothing(response.text, home);
    });
  });
});
