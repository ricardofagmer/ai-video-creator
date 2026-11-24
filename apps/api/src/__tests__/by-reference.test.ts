import 'reflect-metadata';
import assert from 'node:assert/strict';
import { chmod, mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandBus, CommandHandler } from '@nestjs/cqrs';
import { AssetAlreadyExistsError, CreateAssetCommand } from '@studio/core/catalog';
import { CatalogController } from '../catalog/catalog.controller';
import { CatalogReferenceService } from '../catalog/catalog-reference.service';
import { ReferencePathValidator } from '../catalog/reference-path.validator';
import { ReferenceRoots } from '../catalog/reference-roots';
import { RequestContext } from '../platform/request-context';
import {
  SYNTHETIC_CLONE_FOLDER,
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
 * Ticket 09 AC5 (CR11): `POST /catalog/assets/by-reference` refuses `..`, links out of the allowed
 * root and every other path the SPEC 0002 rev 4 section 13.4 validator refuses, and a biometric
 * target is handled by reference only: the api resolves it with realpath/lstat and hands core the
 * path, never reading it. The allowed root is a temp owner home (`ReferenceRoots`), never the real
 * home folder. The biometric target is a synthetic folder inside that temp owner home, named by the
 * harness constant; the owner's real folder is never touched. Core's `CreateAssetCommand` is a
 * stand-in on the real bus that records the input and refuses with `AssetAlreadyExistsError`, so a
 * 409 proves the request passed every api check and reached core.
 */

const REFUSED_STATUS = 422;
const REFUSED_REASON = 'reference-path-refused';

const dispatched: CreateAssetCommand['input'][] = [];

@CommandHandler(CreateAssetCommand)
class StandInCreateAssetHandler {
  execute(command: CreateAssetCommand): Promise<never> {
    dispatched.push(command.input);
    return Promise.reject(new AssetAlreadyExistsError(command.input.assetId));
  }
}

function byReferenceBody(absolutePath: string): Record<string, unknown> {
  return {
    assetId: 'owner-voice',
    kind: 'reference',
    absolutePath,
    metadata: { name: 'Owner voice', owner: 'owner', sensitivity: 'biometric', details: {} },
  };
}

/** The error body without the per-request correlation id, to compare refusals with each other. */
function refusalOf(response: ApiResponse): Record<string, unknown> {
  return Object.fromEntries(Object.entries(jsonBody(response)).filter(([key]) => key !== 'correlationId'));
}

describe('api by-reference registration (ticket 09 AC5, CR11)', () => {
  let home: ApiTestHome;
  let api: RunningApi | null = null;
  let cookie: string;

  beforeEach(async () => {
    dispatched.length = 0;
    home = await createApiTestHome('api-by-reference');
    api = await startApi(home, {
      controllers: [CatalogController],
      providers: [
        StandInCreateAssetHandler,
        {
          provide: CatalogReferenceService,
          useFactory: (commandBus: CommandBus, context: RequestContext): CatalogReferenceService =>
            new CatalogReferenceService(commandBus, new ReferencePathValidator(home.dataHome, new ReferenceRoots(home.ownerHome), context), context),
          inject: [CommandBus, RequestContext],
        },
      ],
    });
    cookie = issuedSession(api).cookie;
  });

  afterEach(async () => {
    await api?.close();
    api = null;
    await home.close();
  });

  function register(absolutePath: string): Promise<ApiResponse> {
    assert.ok(api !== null);
    return api.send(jsonRequest('POST', '/catalog/assets/by-reference', byReferenceBody(absolutePath), { cookie }));
  }

  function assertRefused(response: ApiResponse): void {
    assert.equal(response.status, REFUSED_STATUS, response.text);
    assert.equal(jsonBody(response).reason, REFUSED_REASON);
    assert.equal(dispatched.length, 0, 'core was called for a refused path');
    assertLeaksNothing(response.text, home);
  }

  describe('refusals', () => {
    it('refuses a path with a .. segment with 400 at the contract edge and never calls core', async () => {
      const response = await register(`${home.ownerHome}/../outside/voice.wav`);

      assert.equal(response.status, 400);
      assert.equal(jsonBody(response).reason, 'invalid-request');
      assert.equal(dispatched.length, 0);
      assertLeaksNothing(response.text, home);
    });

    it('refuses a path with an empty segment or a trailing separator with 400', async () => {
      assert.equal((await register(`${home.ownerHome}//voice.wav`)).status, 400);
      assert.equal((await register(`${home.ownerHome}/folder/`)).status, 400);
      assert.equal(dispatched.length, 0);
    });

    it('refuses a link inside the owner home that points outside it', async () => {
      const target = join(home.outside, 'voice.wav');
      await writeFile(target, 'outside-bytes');
      await symlink(target, join(home.ownerHome, 'voice-link.wav'));

      assertRefused(await register(join(home.ownerHome, 'voice-link.wav')));
    });

    it('refuses a link inside the owner home that points into the data home', async () => {
      await symlink(home.dataHome.root, join(home.ownerHome, 'data-link'));

      assertRefused(await register(join(home.ownerHome, 'data-link')));
    });

    it('refuses a path whose parent folder is a link, even when the target lies under the owner home', async () => {
      await mkdir(join(home.ownerHome, 'real-folder'));
      await writeFile(join(home.ownerHome, 'real-folder', 'voice.wav'), 'bytes');
      await symlink(join(home.ownerHome, 'real-folder'), join(home.ownerHome, 'linked-folder'));

      assertRefused(await register(join(home.ownerHome, 'linked-folder', 'voice.wav')));
    });

    it('refuses a path inside the data home and the folder that contains the data home', async () => {
      assertRefused(await register(home.dataHome.assets));
      assertRefused(await register(home.root));
    });

    it('refuses a path outside the owner home', async () => {
      const target = join(home.outside, 'voice.wav');
      await writeFile(target, 'outside-bytes');

      assertRefused(await register(target));
    });

    it('refuses the owner home itself, which is not strictly below the allowed root', async () => {
      assertRefused(await register(home.ownerHome));
    });

    it('refuses a path with a hidden segment', async () => {
      await mkdir(join(home.ownerHome, '.secrets'));
      await writeFile(join(home.ownerHome, '.secrets', 'voice.wav'), 'bytes');

      assertRefused(await register(join(home.ownerHome, '.secrets', 'voice.wav')));
    });

    it('answers a missing path exactly like a path outside the root, so the refusal is no existence oracle', async () => {
      const missing = await register(join(home.ownerHome, 'missing.wav'));
      const outside = await register(join(home.outside, 'missing.wav'));

      assertRefused(missing);
      assert.deepEqual(refusalOf(missing), refusalOf(outside));
    });

    it('refuses a file whose type cannot be derived from its name with 422 before core runs', async () => {
      await writeFile(join(home.ownerHome, 'voice.unknownext'), 'bytes');

      const response = await register(join(home.ownerHome, 'voice.unknownext'));

      assert.equal(response.status, 422);
      assert.equal(dispatched.length, 0);
    });

    it('logs the refused step but never the path', async () => {
      const target = join(home.outside, 'voice.wav');
      await writeFile(target, 'outside-bytes');

      await register(target);

      const logs = home.logs.text();
      assert.match(logs, /catalog\.reference-path-refused/);
      assert.equal(logs.includes(home.root), false, 'a path was logged');
    });
  });

  describe('biometric targets are handled by reference only', () => {
    it('hands core an unreadable biometric file by path, with its type from the name, and copies nothing', async () => {
      const folder = join(home.ownerHome, SYNTHETIC_CLONE_FOLDER);
      await mkdir(folder);
      const file = join(folder, 'voice.wav');
      await writeFile(file, 'synthetic-bytes');
      // No read permission: any attempt by the api to open the file would fail the request.
      await chmod(file, 0o000);

      const response = await register(file);

      assert.equal(response.status, 409, response.text);
      assert.equal(dispatched.length, 1);
      assert.deepEqual(dispatched[0]?.content, { source: 'reference-file', absolutePath: file, mimeType: 'audio/wav' });
      assert.equal(dispatched[0]?.metadata.sensitivity, 'biometric');
      assert.equal(response.text.includes(SYNTHETIC_CLONE_FOLDER), false, 'the path came back to the client');
      assertLeaksNothing(response.text, home);
      assert.deepEqual(await readdir(home.dataHome.assets), [], 'something was copied into the data home');
      assert.equal(home.logs.text().includes(SYNTHETIC_CLONE_FOLDER), false, 'the path was logged');
    });

    it('hands core an unlistable biometric folder as a reference folder', async () => {
      const folder = join(home.ownerHome, SYNTHETIC_CLONE_FOLDER);
      await mkdir(folder);
      // Search only, no read permission: resolving the path works, listing the folder would fail.
      await chmod(folder, 0o100);
      let response: ApiResponse;
      try {
        response = await register(folder);
      } finally {
        await chmod(folder, 0o700);
      }

      assert.equal(response.status, 409, response.text);
      assert.deepEqual(dispatched[0]?.content, { source: 'reference-folder', absolutePath: folder });
      assert.deepEqual(await readdir(home.dataHome.assets), []);
    });
  });
});
