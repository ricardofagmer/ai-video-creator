import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type MetricBatchIngestSummary } from '@studio/core/metrics';
import { DataHome } from '@studio/core/paths';
import { type PublishSyncSummary, type RequestPublishResult } from '@studio/core/platforms';
import { type GateChangeRequest, type PlatformView, type PlatformsView, type RunPublishView } from '@studio/shared/api';
import { type CapabilityStatus, type Platform } from '@studio/shared/platforms';
import { runDirectory } from '@studio/shared/run-files';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { type Printer } from '../output/printer.js';
import { type LinePrompter, type TerminalPort } from '../terminal/line-prompt.js';
import { type PlatformGateway, type PublishSubmission } from './platform-gateway.js';

/*
 * Test-only fakes for the SPEC 0007 CLI commands: the core gateway in memory, a scripted terminal,
 * a capturing printer and a data home under the OS temp folder. Nothing here opens the real data
 * home, the database, the Keychain or the network.
 */

/** The run of the watcher's shared fixture; its run.json is copied into the temp data home. */
export const RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
export const RUN_TITLE = 'Tour do app de exemplo';
export const ATTEMPT_ID = '01JDA700000000000000000AT1';
export const ARTIFACT_SHA256 = 'b'.repeat(64);
export const SENTINEL_TOKEN = 'sentinel-access-token-qfxazk';

const FIXTURE_RUN_FILE = fileURLToPath(new URL('../../../../apps/watcher/fixtures/product-tour-16x9/run.json', import.meta.url));

export class CapturingPrinter implements Printer {
  readonly lines: string[] = [];
  readonly errors: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.errors.push(text);
  }

  text(): string {
    return [...this.lines, ...this.errors].join('\n');
  }
}

/** A terminal whose answers are given up front; records every question and whether it was opened. */
export class ScriptedTerminal implements TerminalPort {
  readonly questions: string[] = [];
  opened = 0;
  closed = 0;

  constructor(
    private readonly interactive: boolean,
    private readonly answers: string[],
  ) {}

  isInteractive(): boolean {
    return this.interactive;
  }

  open(): LinePrompter {
    this.opened += 1;
    return {
      ask: async (label) => {
        this.questions.push(label);
        const answer = this.answers.shift();
        if (answer === undefined) throw new Error(`no scripted answer for: ${label}`);
        return answer;
      },
      close: () => {
        this.closed += 1;
      },
    };
  }
}

export function platformView(platform: Platform, status: { metrics: CapabilityStatus; publish: CapabilityStatus }): PlatformView {
  return {
    platform,
    mode: 'mock',
    gates: { metrics: 'enabled', publish: 'enabled' },
    status,
    reconnectReason: status.metrics === 'needs-reconnect' ? 'token-revoked' : null,
    accountLabel: 'Conta simulada',
    connectedAt: '2026-11-20T10:00:00.000Z',
    lastPollAt: null,
    backoff: null,
    trackedPublications: 2,
    importFallback: true,
  };
}

export function connectedPlatforms(): PlatformsView {
  return {
    platforms: [
      platformView('youtube', { metrics: 'connected', publish: 'connected' }),
      platformView('instagram', { metrics: 'connected', publish: 'unsupported' }),
      platformView('tiktok', { metrics: 'connected', publish: 'connected' }),
    ],
  };
}

export function runPublishView(): RunPublishView {
  return {
    runId: RUN_ID,
    approved: true,
    artifact: { sha256: ARTIFACT_SHA256, sizeBytes: 84_000_000 },
    biometricAssets: [{ ref: 'voz-ricardo@3', title: 'Voz do Ricardo', kind: 'ai-model' }],
    platforms: [
      { platform: 'youtube', mode: 'mock', status: 'connected', eligible: true, refusal: null, allowedVisibilities: ['public', 'unlisted', 'private'], publicationId: null },
      {
        platform: 'instagram',
        mode: 'mock',
        status: 'unsupported',
        eligible: false,
        refusal: 'platform-publish-unsupported',
        allowedVisibilities: [],
        publicationId: null,
      },
      { platform: 'tiktok', mode: 'mock', status: 'connected', eligible: true, refusal: null, allowedVisibilities: ['private'], publicationId: null },
    ],
    attempts: [],
    leftTheMachine: [],
  };
}

/** Core's platform handlers in memory; every call is recorded so a refusal can prove nothing ran. */
export class FakePlatformGateway implements PlatformGateway {
  readonly calls: string[] = [];
  readonly submissions: PublishSubmission[] = [];
  platforms: PlatformsView = connectedPlatforms();
  publishView: RunPublishView = runPublishView();
  /** When set, `requestPublish` records the submission and then rejects with it, as core's refusal would. */
  requestPublishRefusal: Error | null = null;

  async list(): Promise<PlatformsView> {
    this.calls.push('list');
    return this.platforms;
  }

  async setGate(platform: Platform, change: GateChangeRequest): Promise<PlatformView> {
    this.calls.push(`setGate:${platform}:${change.capability}:${change.state}`);
    return this.viewOf(platform);
  }

  async disconnect(platform: Platform): Promise<PlatformView> {
    this.calls.push(`disconnect:${platform}`);
    return { ...this.viewOf(platform), status: { metrics: 'disconnected', publish: 'disconnected' }, accountLabel: null, connectedAt: null };
  }

  async syncMetrics(): Promise<MetricBatchIngestSummary> {
    this.calls.push('syncMetrics');
    return { ingested: 0, duplicates: 0, refused: 0, scoreRecomputed: false };
  }

  async syncAttempts(): Promise<PublishSyncSummary> {
    this.calls.push('syncAttempts');
    return { open: 0, updated: 0, expired: 0, linked: 0 };
  }

  async runPublish(runId: string): Promise<RunPublishView> {
    this.calls.push(`runPublish:${runId}`);
    return this.publishView;
  }

  async requestPublish(submission: PublishSubmission): Promise<RequestPublishResult> {
    this.calls.push('requestPublish');
    this.submissions.push(submission);
    if (this.requestPublishRefusal !== null) throw this.requestPublishRefusal;
    return {
      outcome: 'created',
      attempt: {
        attemptId: ATTEMPT_ID,
        runId: submission.runId,
        platform: submission.platform,
        mode: 'mock',
        state: 'queued',
        since: '2026-11-20T10:00:00.000Z',
        bytesSent: 0,
        bytesTotal: 84_000_000,
        reasonId: null,
        expiresAt: '2026-11-20T12:00:00.000Z',
        publicationId: null,
        requestedAt: '2026-11-20T10:00:00.000Z',
      },
    };
  }

  private viewOf(platform: Platform): PlatformView {
    const view = this.platforms.platforms.find((entry) => entry.platform === platform);
    if (view === undefined) throw new Error(`no view for ${platform}`);
    return view;
  }
}

export interface TempStudio {
  dataHome: DataHome;
  printer: CapturingPrinter;
  dependencies: CommandDependencies;
  remove(): Promise<void>;
}

/** An empty data home under the OS temp folder, with the CLI dependencies that point at it. */
export async function createTempStudio(): Promise<TempStudio> {
  const root = await mkdtemp(join(tmpdir(), 'studio-cli-r4-'));
  const dataHome = new DataHome(root);
  const printer = new CapturingPrinter();
  const dependencies: CommandDependencies = {
    settings: { dataHome, ports: { web: 4310, api: 4311 }, studioRoot: root, childEnvironment: {}, keyVariablesSet: [] },
    printer,
    signal: new AbortController().signal,
  };
  return { dataHome, printer, dependencies, remove: () => rm(root, { recursive: true, force: true }) };
}

/** Copies the fixture run.json into the temp data home, as `runs/<RUN_ID>/run.json`. */
export async function writeFixtureRun(dataHome: DataHome): Promise<void> {
  const runDir = runDirectory(dataHome.runs, RUN_ID);
  await mkdir(runDir, { recursive: true });
  await copyFile(FIXTURE_RUN_FILE, join(runDir, 'run.json'));
}
