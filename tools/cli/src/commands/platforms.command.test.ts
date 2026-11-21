import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { PlatformRefusedError } from '@studio/core/platforms';
import { capabilityStatusLabels, type CapabilityStatus } from '@studio/shared/platforms';
import { describePlatformError } from '../errors/platform-messages.js';
import { ExitCode } from '../errors/exit-codes.js';
import { FakePlatformGateway, SENTINEL_TOKEN, createTempStudio, platformView, type TempStudio } from '../platforms/platform-cli.harness.test.js';
import { platformStatusLines } from '../platforms/platform-text.js';
import { platformsConnectCommand, platformsDisconnectCommand, platformsListCommand } from './platforms.command.js';

/*
 * `studio platforms list`, `studio status` platform lines, `disconnect` and `connect` (SPEC 0007
 * sections 5.3 and 5.9, AC 43, AC 44): the status words are the section 5.3 labels, the same the
 * web shows; the CSV and form import note is always printed; no output carries a token or a URL
 * with an OAuth `code` or `state`.
 */

/** Section 5.3 pt-BR labels, typed out from the frozen spec. */
const specLabels: Readonly<Record<CapabilityStatus, string>> = {
  unsupported: 'Publique no aplicativo e cole o link',
  'awaiting-review': 'Aguardando revisão da plataforma',
  'not-configured': 'Aplicativo não configurado',
  disconnected: 'Conta não conectada',
  'needs-reconnect': 'Reconecte a conta',
  connected: 'Conectada',
};

const NOW = new Date('2026-11-20T12:00:00.000Z');

/** One platform per pair of statuses, so the six statuses all appear once. */
function everyStatus(gateway: FakePlatformGateway): void {
  gateway.platforms = {
    platforms: [
      platformView('youtube', { metrics: 'connected', publish: 'not-configured' }),
      platformView('instagram', { metrics: 'awaiting-review', publish: 'unsupported' }),
      platformView('tiktok', { metrics: 'needs-reconnect', publish: 'disconnected' }),
    ],
  };
}

function assertNoSecretInOutput(text: string): void {
  assert.equal(text.includes(SENTINEL_TOKEN), false);
  assert.doesNotMatch(text, /[?&](code|state)=/);
}

describe('studio platforms (SPEC 0007 sections 5.3 and 5.9)', () => {
  let studio: TempStudio;
  let gateway: FakePlatformGateway;

  beforeEach(async () => {
    studio = await createTempStudio();
    gateway = new FakePlatformGateway();
  });

  afterEach(async () => {
    await studio.remove();
  });

  it('uses the shared capabilityStatusLabels, which equal the section 5.3 words', () => {
    assert.deepEqual({ ...capabilityStatusLabels }, specLabels);
  });

  it('prints each platform status with the section 5.3 words (AC 44)', async () => {
    everyStatus(gateway);

    assert.equal(await platformsListCommand({ gateway, now: () => NOW }, studio.dependencies), ExitCode.ok);

    const lines = studio.printer.lines;
    assert.ok(lines.includes(`  Métricas: ${specLabels.connected} · Publicação: ${specLabels['not-configured']}`));
    assert.ok(lines.includes(`  Métricas: ${specLabels['awaiting-review']} · Publicação: ${specLabels.unsupported}`));
    assert.ok(lines.includes(`  Métricas: ${specLabels['needs-reconnect']} · Publicação: ${specLabels.disconnected}`));
  });

  it('always says the CSV and form import stay available, and that connecting is web-only', async () => {
    everyStatus(gateway);

    await platformsListCommand({ gateway, now: () => NOW }, studio.dependencies);

    const text = studio.printer.text();
    assert.match(text, /A importação por CSV e o formulário continuam disponíveis\./);
    assert.match(text, /http:\/\/127\.0\.0\.1:4310\/contas/);
    assertNoSecretInOutput(text);
  });

  it('shows Reconecte a conta in studio status after a revoked token (AC 43)', () => {
    everyStatus(gateway);

    const lines = platformStatusLines(gateway.platforms, NOW);

    assert.ok(lines.some((line) => line.includes('TikTok') && line.includes(`Métricas: ${specLabels['needs-reconnect']}`)));
    assert.ok(lines.some((line) => line.includes('Reconecte a conta pela página Contas')));
  });

  it('disconnects through core and prints no token or callback URL', async () => {
    const exitCode = await platformsDisconnectCommand('youtube', { gateway, now: () => NOW }, studio.dependencies);

    assert.equal(exitCode, ExitCode.ok);
    assert.deepEqual(gateway.calls, ['disconnect:youtube']);
    assert.match(studio.printer.text(), /o token foi apagado do Keychain/);
    assertNoSecretInOutput(studio.printer.text());
  });

  it('starts no connection from the terminal: connect is web-only (exit 2)', () => {
    assert.equal(platformsConnectCommand('tiktok', studio.dependencies), ExitCode.usage);
    assert.deepEqual(gateway.calls, []);
    assertNoSecretInOutput(studio.printer.text());
  });

  it('describes a failed code exchange with the pt-BR text and no URL', () => {
    const text = describePlatformError(new PlatformRefusedError('oauth-exchange-failed', 'youtube'));

    assert.equal(text, 'Não foi possível concluir a conexão com YouTube. Tente de novo.');
  });
});
