import { readdir } from 'node:fs/promises';
import { type PublishRequest } from '@studio/shared/api';
import { type Platform, type PlatformGates } from '@studio/shared/platforms';
import { writeGatesFile } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { CompleteConnectionCommand, RequestPublishCommand, StartConnectionCommand } from './commands/platform.commands';
import { type PlatformGraph } from './platform-graph.harness.test';
import { type PlatformHarness } from './platform-harness.harness.test';
import { type SeededRun } from './run-fixture.harness.test';

/*
 * Test-only steps shared by the publish scenarios (SPEC 0007 sections 5.2 and 5.4): open gates,
 * a mock connect through the real start and callback handlers, and a request body that matches a
 * seeded run. Helpers only: the `.harness.test.ts` name keeps the file out of the build; it
 * declares no test.
 */

export const SESSION_ID = 'session-owner-under-test';
export const API_PORT = 4000;

/** Opens both gates of every platform (Instagram publish stays unsupported regardless). */
export async function openAllGates(harness: PlatformHarness): Promise<void> {
  const enabled: PlatformGates = { metrics: 'enabled', publish: 'enabled' };
  await writeGatesFile(harness.platformRoot, {
    format: 1,
    gates: { youtube: enabled, instagram: { metrics: 'enabled', publish: 'awaiting-review' }, tiktok: enabled },
    updatedAt: harness.clock.now().toISOString(),
    updatedBy: 'owner',
  });
}

/** A mock connect: start, then the callback with the code and state the mock authorize URL carries. */
export async function connectMock(graph: PlatformGraph, platform: Platform): Promise<string> {
  const started = await graph.start.execute(new StartConnectionCommand({ platform, sessionId: SESSION_ID, apiPort: API_PORT, correlationId: null }));
  const url = new URL(started.authorizeUrl);
  const completed = await graph.complete.execute(
    new CompleteConnectionCommand({
      platform,
      sessionId: SESSION_ID,
      apiPort: API_PORT,
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      error: null,
      connectedBy: 'owner',
      correlationId: null,
    }),
  );
  return completed.connectionId;
}

export function publishBody(run: SeededRun, overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    idempotencyKey: newUlid(),
    metadata: {
      title: 'Titulo de teste do tour',
      caption: 'Legenda de teste do tour',
      tags: ['tour_teste'],
      visibility: 'private',
      aiDisclosure: true,
    },
    biometricRefs: run.biometricRefs,
    artifactSha256: run.finalSha256,
    ...overrides,
  };
}

export function requestCommand(options: { run: SeededRun; platform: Platform; body: PublishRequest }): RequestPublishCommand {
  return new RequestPublishCommand({
    runId: options.run.runId,
    platform: options.platform,
    request: options.body,
    requestedBy: 'owner',
    createdBy: 'api',
    correlationId: null,
  });
}

/** Attempt folders under `platform/publish/`, empty when the folder does not exist. */
export async function publishFolders(harness: PlatformHarness): Promise<string[]> {
  try {
    return await readdir(`${harness.platformRoot}/publish`);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}
