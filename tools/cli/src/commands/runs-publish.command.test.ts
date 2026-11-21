import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { PlatformRefusedError } from '@studio/core/platforms';
import { PublishRequestSchema } from '@studio/shared/api';
import { TerminalRequiredError } from '../errors/cli.errors.js';
import { toErrorReport } from '../errors/error-report.js';
import { ExitCode } from '../errors/exit-codes.js';
import { PlatformRequestRefusedError, PublishNotConfirmedError } from '../errors/platform.errors.js';
import {
  ARTIFACT_SHA256,
  FakePlatformGateway,
  RUN_ID,
  ScriptedTerminal,
  createTempStudio,
  writeFixtureRun,
  type TempStudio,
} from '../platforms/platform-cli.harness.test.js';
import { runsPublishCommand } from './runs-publish.command.js';

/*
 * `studio runs publish <runId> --platform <p>` (SPEC 0007 sections 5.4 and 5.9, K4, OD4, OD8):
 * a terminal is required before anything is read; the typed confirmation is the only way to send
 * the request; Instagram is refused with the verbatim pt-BR text before any question; the owner's
 * title, caption and tags are never printed back. Core is the in-memory gateway; the run is the
 * watcher fixture copied into a temp data home.
 */

const TITLE = 'Sentinel title 9d1e40';
const CAPTION = 'Sentinel caption 3b77aa';
const TAG = 'sentineltag61f0';
const NOW = new Date('2026-11-20T10:00:00.000Z');

/** Title, caption, tags, visibility, AI disclosure (Enter keeps the default), then the confirmation. */
function answersEndingWith(confirmation: string): string[] {
  return [TITLE, CAPTION, `${TAG}, outra`, 'privado', '', confirmation];
}

async function refusalOf(promise: Promise<number>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail('the command finished instead of refusing');
}

describe('studio runs publish (SPEC 0007 section 5.9)', () => {
  let studio: TempStudio;
  let gateway: FakePlatformGateway;

  beforeEach(async () => {
    studio = await createTempStudio();
    gateway = new FakePlatformGateway();
  });

  afterEach(async () => {
    await studio.remove();
  });

  it('refuses without a terminal before reading the run or calling core', async () => {
    const terminal = new ScriptedTerminal(false, answersEndingWith('publicar youtube'));

    const error = await refusalOf(runsPublishCommand({ runId: RUN_ID, platform: 'youtube' }, { gateway, terminal, now: () => NOW }, studio.dependencies));

    assert.ok(error instanceof TerminalRequiredError);
    assert.deepEqual(gateway.calls, []);
    assert.equal(terminal.opened, 0);
    assert.deepEqual(studio.printer.lines, []);
  });

  for (const typed of ['sim', 'publicar tiktok', 'PUBLICAR YOUTUBE', '']) {
    it(`requests nothing when the confirmation typed is ${JSON.stringify(typed)}`, async () => {
      await writeFixtureRun(studio.dataHome);
      const terminal = new ScriptedTerminal(true, answersEndingWith(typed));

      const error = await refusalOf(runsPublishCommand({ runId: RUN_ID, platform: 'youtube' }, { gateway, terminal, now: () => NOW }, studio.dependencies));

      assert.ok(error instanceof PublishNotConfirmedError);
      assert.deepEqual(gateway.submissions, []);
      assert.equal(gateway.calls.includes('requestPublish'), false);
      assert.equal(terminal.closed, 1);
    });
  }

  it('refuses Instagram with the pt-BR text of platform-publish-unsupported before any question (OD8)', async () => {
    await writeFixtureRun(studio.dataHome);
    const terminal = new ScriptedTerminal(true, answersEndingWith('publicar instagram'));

    const error = await refusalOf(runsPublishCommand({ runId: RUN_ID, platform: 'instagram' }, { gateway, terminal, now: () => NOW }, studio.dependencies));

    assert.ok(error instanceof PlatformRequestRefusedError);
    assert.equal(error.message, 'O estúdio não publica em Instagram. Publique no aplicativo e cole o link da publicação.');
    assert.equal(terminal.opened, 0);
    assert.deepEqual(gateway.calls, [`runPublish:${RUN_ID}`]);
  });

  it('sends one request after the typed confirmation, with the dialog hash and the biometric refs', async () => {
    await writeFixtureRun(studio.dataHome);
    const terminal = new ScriptedTerminal(true, answersEndingWith('publicar youtube'));

    const exitCode = await runsPublishCommand({ runId: RUN_ID, platform: 'youtube' }, { gateway, terminal, now: () => NOW }, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.equal(gateway.submissions.length, 1);
    const [submission] = gateway.submissions;
    assert.ok(submission !== undefined);
    assert.equal(submission.runId, RUN_ID);
    assert.equal(submission.platform, 'youtube');
    assert.deepEqual(submission.request.metadata, { title: TITLE, caption: CAPTION, tags: [TAG, 'outra'], visibility: 'private', aiDisclosure: true });
    assert.deepEqual(submission.request.biometricRefs, ['voz-ricardo@3']);
    assert.equal(submission.request.artifactSha256, ARTIFACT_SHA256);
    assert.equal(PublishRequestSchema.shape.idempotencyKey.safeParse(submission.request.idempotencyKey).success, true);
  });

  it('reports core refusing a reused idempotency key with the pt-BR text and the conflict exit code (C9)', async () => {
    await writeFixtureRun(studio.dataHome);
    gateway.requestPublishRefusal = new PlatformRefusedError('publish-idempotency-key-reused', 'youtube', RUN_ID);
    const terminal = new ScriptedTerminal(true, answersEndingWith('publicar youtube'));

    const error = await refusalOf(runsPublishCommand({ runId: RUN_ID, platform: 'youtube' }, { gateway, terminal, now: () => NOW }, studio.dependencies));

    assert.ok(error instanceof PlatformRefusedError);
    assert.equal(gateway.submissions.length, 1);
    const report = toErrorReport(error);
    assert.equal(report.exitCode, ExitCode.conflict);
    assert.equal(report.message, 'Este pedido de publicação já foi enviado com outros dados. Abra o diálogo de novo e envie outra vez.');
    assert.doesNotMatch(studio.printer.text(), /Pedido de publicação .* registrado/);
    for (const typed of [TITLE, CAPTION, TAG]) assert.equal(report.message.includes(typed), false, `${typed} was printed back`);
  });

  it('names every biometric asset by title, kind and ref, and says nothing is sent in mock mode', async () => {
    await writeFixtureRun(studio.dataHome);
    const terminal = new ScriptedTerminal(true, answersEndingWith('publicar youtube'));

    await runsPublishCommand({ runId: RUN_ID, platform: 'youtube' }, { gateway, terminal, now: () => NOW }, studio.dependencies);

    const output = studio.printer.text();
    assert.match(output, /Este vídeo usa os ativos biométricos abaixo\. Ao publicar, você confirma o envio deles para YouTube\./);
    assert.match(output, /Voz do Ricardo \(ai-model, voz-ricardo@3\)/);
    assert.match(output, /Modo simulado: nada será enviado\./);
  });

  it('never prints back the title, caption or tags the owner typed', async () => {
    await writeFixtureRun(studio.dataHome);
    const terminal = new ScriptedTerminal(true, answersEndingWith('publicar youtube'));

    await runsPublishCommand({ runId: RUN_ID, platform: 'youtube' }, { gateway, terminal, now: () => NOW }, studio.dependencies);

    const shown = [studio.printer.text(), ...terminal.questions].join('\n');
    for (const typed of [TITLE, CAPTION, TAG]) assert.equal(shown.includes(typed), false, `${typed} was printed back`);
    assert.doesNotMatch(shown, /[?&](code|state)=/);
  });
});
