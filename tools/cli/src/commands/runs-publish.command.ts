import { type RequestPublishResult } from '@studio/core/platforms';
import { type PlatformView, type PublishPlatformView, type RunPublishView } from '@studio/shared/api';
import { type Platform, type PublishMetadata } from '@studio/shared/platforms';
import { newUlid } from '@studio/shared/run-files';
import { type RunId } from '@studio/shared/run-format';
import { TerminalRequiredError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { PlatformRequestRefusedError, PublishNotConfirmedError } from '../errors/platform.errors.js';
import { formatBytes, formatInstant } from '../output/format.js';
import { type Printer } from '../output/printer.js';
import { MOCK_MODE_TEXT, PLATFORM_LABELS, PUBLISH_STATE_LABELS, otherMode, refusalText } from '../platforms/platform-labels.js';
import { type PlatformGateway } from '../platforms/platform-gateway.js';
import { askPublishMetadata, askTypedConfirmation, biometricLines } from '../platforms/publish-prompt.js';
import { readRunSnapshot } from '../runs/run-reader.js';
import { type LinePrompter, type TerminalPort } from '../terminal/line-prompt.js';
import { type CommandDependencies } from './command-dependencies.js';

export interface RunsPublishOptions {
  runId: RunId;
  platform: Platform;
}

/** Injected so the command is testable without core, a terminal or the system clock. */
export interface RunsPublishPorts {
  gateway: PlatformGateway;
  terminal: TerminalPort;
  now: () => Date;
}

/** The tab of `platform`; the core view lists each platform exactly once. */
function tabOf(view: RunPublishView, platform: Platform): PublishPlatformView {
  const tab = view.platforms.find((entry) => entry.platform === platform);
  if (tab === undefined) {
    throw new PlatformRequestRefusedError(`${PLATFORM_LABELS[platform]} não aparece na visão de publicação desta execução; rode "studio doctor".`);
  }
  return tab;
}

/** Section 5.4 steps 3 to 7 as the dialog sees them: the first refusal a request would meet now. */
function refuseWhenIneligible(tab: PublishPlatformView): void {
  if (tab.refusal === null) return;
  const accountMode = tab.refusal === 'platform-mode-mismatch' ? otherMode(tab.mode) : null;
  throw new PlatformRequestRefusedError(refusalText(tab.refusal, { platform: tab.platform, accountMode }));
}

function summaryLines(options: { view: RunPublishView; tab: PublishPlatformView; account: PlatformView | undefined }): string[] {
  const { view, tab, account } = options;
  const lines = [`Publicar a execução ${view.runId} em ${PLATFORM_LABELS[tab.platform]}`];
  if (tab.mode === 'mock') lines.push(MOCK_MODE_TEXT);
  if (view.artifact !== null) lines.push(`Vídeo final: ${formatBytes(view.artifact.sizeBytes)}`);
  if (account !== undefined && account.accountLabel !== null) lines.push(`Conta: ${account.accountLabel}`);
  if (tab.platform === 'tiktok') lines.push('Rascunho na caixa de entrada do TikTok; você termina o post no aplicativo.');
  return lines;
}

function resultLines(result: RequestPublishResult, runId: RunId): string[] {
  const { attempt } = result;
  const platform = PLATFORM_LABELS[attempt.platform];
  const state = PUBLISH_STATE_LABELS[attempt.state];
  const head =
    result.outcome === 'created'
      ? `Pedido de publicação ${attempt.attemptId} registrado para ${platform}: ${state}.`
      : `Este pedido já existia (${attempt.attemptId}, ${platform}): ${state}.`;
  return [
    head,
    `O watcher envia entre execuções; se não for enviado até ${formatInstant(attempt.expiresAt)}, o pedido vence e nada é enviado.`,
    `Acompanhe com "studio runs show ${runId}".`,
  ];
}

function printAll(printer: Printer, lines: readonly string[]): void {
  for (const line of lines) printer.line(line);
}

interface ConfirmedRequest {
  metadata: PublishMetadata;
  biometricRefs: string[];
}

/** The questions, the biometric list and the typed confirmation; any other answer refuses. */
async function collectAndConfirm(options: {
  prompter: LinePrompter;
  view: RunPublishView;
  tab: PublishPlatformView;
  runTitle: string;
  printer: Printer;
}): Promise<ConfirmedRequest> {
  const { prompter, view, tab, printer } = options;
  const metadata = await askPublishMetadata(prompter, {
    platform: tab.platform,
    runTitle: options.runTitle,
    allowedVisibilities: tab.allowedVisibilities,
    usesBiometric: view.biometricAssets.length > 0,
  });
  printAll(printer, biometricLines(tab.platform, view.biometricAssets));
  if (!(await askTypedConfirmation(prompter, tab.platform))) throw new PublishNotConfirmedError();
  return { metadata, biometricRefs: view.biometricAssets.map((asset) => asset.ref) };
}

/**
 * `studio runs publish <runId> --platform <p>` (SPEC 0007 sections 5.4 and 5.9, K4, OD4). Needs a
 * terminal before anything is read. After `PublishAttemptSync` and the dialog view, a platform the
 * request would be refused on (Instagram: `platform-publish-unsupported`, OD8) is refused with its
 * pt-BR text before any question. Then it asks title, caption, tags, visibility and the AI
 * disclosure, prints every biometric asset by title, kind and `assetId@version`, and requires the
 * typed confirmation; no flag can supply it. It writes only through `RequestPublish`
 * (`createdBy: 'cli'`), which re-checks every step; the watcher uploads later. Nothing typed is
 * printed back or logged.
 */
export async function runsPublishCommand(options: RunsPublishOptions, ports: RunsPublishPorts, dependencies: CommandDependencies): Promise<number> {
  const { printer, settings, signal } = dependencies;
  if (!ports.terminal.isInteractive()) throw new TerminalRequiredError('runs publish');
  const snapshot = await readRunSnapshot(settings.dataHome.runs, options.runId);
  const view = await ports.gateway.runPublish(options.runId);
  const tab = tabOf(view, options.platform);
  refuseWhenIneligible(tab);
  const artifact = view.artifact;
  if (artifact === null) throw new PlatformRequestRefusedError(refusalText('publish-artifact-missing', { platform: tab.platform, accountMode: null }));
  const account = (await ports.gateway.list()).platforms.find((entry) => entry.platform === tab.platform);
  printAll(printer, summaryLines({ view, tab, account }));

  const prompter = ports.terminal.open(signal);
  let confirmed: ConfirmedRequest;
  try {
    confirmed = await collectAndConfirm({ prompter, view, tab, runTitle: snapshot.run.title, printer });
  } finally {
    prompter.close();
  }

  const result = await ports.gateway.requestPublish({
    runId: options.runId,
    platform: tab.platform,
    request: {
      // One key per confirmed command: a repeated command is a new, explicit owner action.
      idempotencyKey: newUlid(ports.now().getTime()),
      metadata: confirmed.metadata,
      biometricRefs: confirmed.biometricRefs,
      artifactSha256: artifact.sha256,
    },
  });
  printAll(printer, resultLines(result, options.runId));
  return ExitCode.ok;
}
