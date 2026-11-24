import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock, type Mock } from 'node:test';
import { type Type } from '@nestjs/common';
import { ReviewModule } from '@studio/core/review';
import { runDirectory, writeWatcherHeartbeat } from '@studio/shared/run-files';
import { ControlRequestSchema, WATCHER_HEARTBEAT_STALE_AFTER_MS, watcherHeartbeatFileName, type ControlRequest } from '@studio/shared/run-format';
import { RunDecisionsController } from '../runs/run-decisions.controller';
import { WatcherController } from '../watcher/watcher.controller';
import { WatcherStatusReader } from '../watcher/watcher-status.reader';
import {
  FIXTURE_RUN_ID,
  assertLeaksNothing,
  createApiTestHome,
  issuedSession,
  jsonBody,
  jsonRequest,
  startApi,
  writeFixtureRun,
  type ApiResponse,
  type ApiTestHome,
  type RunningApi,
} from './api-test-home';

/*
 * Ticket 09 AC4 (CR11): `POST /runs/:runId/control` writes a `control.json` that the frozen C5
 * `ControlRequestSchema` accepts, through the real core `RequestRunControlHandler` on the real CQRS
 * bus over the temp data home; `GET /watcher` reports the daemon state from the heartbeat file
 * alone. `process.kill` is replaced for every test and must never be called: no run folder carries
 * a watcher pid, and the heartbeat route never reads one.
 */

const MISSING_RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B9Z';

/** Core's review providers are not exported; the module lists them, so they are taken by class name. */
function reviewProvider(name: string): Type<unknown> {
  const providers: unknown = Reflect.getMetadata('providers', ReviewModule);
  assert.ok(Array.isArray(providers));
  const found: unknown = providers.find((provider: unknown) => typeof provider === 'function' && provider.name === name);
  assert.ok(typeof found === 'function' && 'prototype' in found, `ReviewModule provides ${name}`);
  return isType(found) ? found : assert.fail(name);
}

function isType(value: unknown): value is Type<unknown> {
  return typeof value === 'function';
}

async function controlFile(runDir: string): Promise<ControlRequest> {
  return ControlRequestSchema.parse(JSON.parse(await readFile(join(runDir, 'control.json'), 'utf8')));
}

async function hasControlFile(runDir: string): Promise<boolean> {
  return (await readdir(runDir)).includes('control.json');
}

describe('api run control and watcher heartbeat (ticket 09 AC4, CR11)', () => {
  let home: ApiTestHome;
  let api: RunningApi | null = null;
  let cookie: string;
  let kill: Mock<typeof process.kill>;

  beforeEach(async () => {
    kill = mock.method(process, 'kill', (): never => {
      throw new Error('process.kill must not be called by the api');
    });
    home = await createApiTestHome('api-run-control');
    api = await startApi(home, {
      controllers: [RunDecisionsController, WatcherController],
      providers: [
        reviewProvider('ReviewRunAccess'),
        reviewProvider('RunLocks'),
        reviewProvider('RequestRunControlHandler'),
        { provide: WatcherStatusReader, useValue: new WatcherStatusReader(home.dataHome) },
      ],
    });
    cookie = issuedSession(api).cookie;
  });

  afterEach(async () => {
    await api?.close();
    api = null;
    await home.close();
    kill.mock.restore();
  });

  function running(): RunningApi {
    assert.ok(api !== null);
    return api;
  }

  function control(runId: string, kind: string): Promise<ApiResponse> {
    return running().send(jsonRequest('POST', `/runs/${runId}/control`, { kind }, { cookie }));
  }

  describe('POST /runs/:runId/control', () => {
    it('answers 202 for pause on a pending run and writes a schema-valid control.json', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      const before = Date.now();

      const response = await control(FIXTURE_RUN_ID, 'pause');

      assert.equal(response.status, 202, response.text);
      assert.deepEqual(jsonBody(response), { runId: FIXTURE_RUN_ID, requested: 'pause' });
      const written = await controlFile(runDir);
      assert.equal(written.pause, true);
      assert.equal(written.stop, false);
      assert.equal(written.resume, undefined);
      assert.ok(written.at >= before && written.at <= Date.now(), 'the request time is the server clock');
      assert.equal(kill.mock.callCount(), 0);
    });

    it('keeps the pause flag when stop follows pause', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });
      assert.equal((await control(FIXTURE_RUN_ID, 'pause')).status, 202);

      const response = await control(FIXTURE_RUN_ID, 'stop');

      assert.equal(response.status, 202);
      const written = await controlFile(runDir);
      assert.deepEqual([written.pause, written.stop], [true, true]);
    });

    it('writes resume and clears both flags for a paused run with no live watcher', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID, state: { status: 'paused', since: '2026-11-20T10:00:00.000Z' } });

      const response = await control(FIXTURE_RUN_ID, 'resume');

      assert.equal(response.status, 202, response.text);
      const written = await controlFile(runDir);
      assert.deepEqual([written.pause, written.stop, written.resume], [false, false, true]);
      assert.equal(kill.mock.callCount(), 0);
    });

    it('refuses resume on a pending run with 409 and writes nothing', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });

      const response = await control(FIXTURE_RUN_ID, 'resume');

      assert.equal(response.status, 409);
      assert.equal(jsonBody(response).reason, 'review-not-allowed');
      assert.equal(await hasControlFile(runDir), false);
      assertLeaksNothing(response.text, home);
    });

    it('refuses pause on an approved run with 409 and writes nothing', async () => {
      const runDir = await writeFixtureRun(home, {
        folderRunId: FIXTURE_RUN_ID,
        state: { status: 'approved', since: '2026-11-20T10:00:00.000Z', decidedBy: 'owner' },
      });

      const response = await control(FIXTURE_RUN_ID, 'pause');

      assert.equal(response.status, 409);
      assert.equal(await hasControlFile(runDir), false);
    });

    it('answers 404 for a run that does not exist and creates no run folder', async () => {
      const response = await control(MISSING_RUN_ID, 'pause');

      assert.equal(response.status, 404);
      assert.equal((await readdir(home.dataHome.runs)).includes(MISSING_RUN_ID), false);
      assertLeaksNothing(response.text, home);
    });

    it('refuses an unknown control kind with 400 before core runs', async () => {
      const runDir = await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });

      const response = await control(FIXTURE_RUN_ID, 'kill');

      assert.equal(response.status, 400);
      assert.equal(jsonBody(response).reason, 'invalid-request');
      assert.equal(await hasControlFile(runDir), false);
    });

    it('refuses a client-supplied time or extra field in the body with 400', async () => {
      await writeFixtureRun(home, { folderRunId: FIXTURE_RUN_ID });

      const response = await running().send(jsonRequest('POST', `/runs/${FIXTURE_RUN_ID}/control`, { kind: 'pause', at: 1 }, { cookie }));

      assert.equal(response.status, 400);
      assert.equal(await hasControlFile(runDirectory(home.dataHome.runs, FIXTURE_RUN_ID)), false);
    });
  });

  describe('GET /watcher', () => {
    async function watcherState(): Promise<Record<string, unknown>> {
      const response = await running().send({ path: '/watcher', headers: { cookie } });
      assert.equal(response.status, 200, response.text);
      assert.equal(response.headers['cache-control'], 'no-store');
      return jsonBody(response);
    }

    it('reports absent with no last-seen time when no heartbeat file exists', async () => {
      assert.deepEqual(await watcherState(), { state: 'absent', lastSeenAt: null });
    });

    it('reports alive for a fresh heartbeat and answers only state and lastSeenAt', async () => {
      const at = new Date().toISOString();
      await writeWatcherHeartbeat(home.dataHome.logs, { format: 1, at });

      const state = await watcherState();

      assert.deepEqual(state, { state: 'alive', lastSeenAt: at });
      assert.equal(kill.mock.callCount(), 0, 'no process was probed');
    });

    it('reports dead with the last-seen time for a heartbeat older than the stale window', async () => {
      const at = new Date(Date.now() - WATCHER_HEARTBEAT_STALE_AFTER_MS - 60_000).toISOString();
      await writeWatcherHeartbeat(home.dataHome.logs, { format: 1, at });

      assert.deepEqual(await watcherState(), { state: 'dead', lastSeenAt: at });
    });

    it('reports dead with no time for a heartbeat dated beyond the window in the future', async () => {
      const at = new Date(Date.now() + WATCHER_HEARTBEAT_STALE_AFTER_MS + 60_000).toISOString();
      await writeWatcherHeartbeat(home.dataHome.logs, { format: 1, at });

      assert.deepEqual(await watcherState(), { state: 'dead', lastSeenAt: null });
    });

    it('reports dead with no time for an unreadable heartbeat (invalid JSON)', async () => {
      await writeFile(join(home.dataHome.logs, watcherHeartbeatFileName), '{"format":1,', { mode: 0o600 });

      assert.deepEqual(await watcherState(), { state: 'dead', lastSeenAt: null });
    });

    it('reports dead with no time for a heartbeat that carries a pid', async () => {
      await writeFile(join(home.dataHome.logs, watcherHeartbeatFileName), JSON.stringify({ format: 1, at: new Date().toISOString(), pid: process.pid }), { mode: 0o600 });

      const state = await watcherState();

      assert.deepEqual(state, { state: 'dead', lastSeenAt: null });
      assert.equal(kill.mock.callCount(), 0);
    });

    it('reports dead with no time when the heartbeat file is a symlink', async () => {
      const target = join(home.outside, 'heartbeat.json');
      await writeFile(target, JSON.stringify({ format: 1, at: new Date().toISOString() }));
      await symlink(target, join(home.dataHome.logs, watcherHeartbeatFileName));

      assert.deepEqual(await watcherState(), { state: 'dead', lastSeenAt: null });
    });

    it('needs a session like every other guarded route', async () => {
      assert.equal((await running().send({ path: '/watcher' })).status, 401);
    });
  });
});
