import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type PlatformMetrics } from '@studio/shared/metrics';
import {
  localDateOf,
  SecretToken,
  type MetricResult,
  type PlatformClient,
  type PlatformClientCredentials,
  type TokenBundle,
  type UploadOutcome,
  type UploadRequest,
  type UploadStatus,
} from '@studio/core/platforms';
import { defaultGates, type AccountFile, type Platform, type PlatformGates, type PublishRequestFile, type Visibility } from '@studio/shared/platforms';
import { createPublishRequest, writeAccountFile, writeGatesFile } from '@studio/shared/platforms/files';
import { newUlid, runDirectory, writeApprovalFile, writeRunFile, writeRunManifest } from '@studio/shared/run-files';
import { RunFileSchema, runFileNames, type RunFile } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';

/*
 * Test support for the platform step tests (no test cases of its own): sentinels, an injected
 * clock, a hand-written `PlatformClient` double that counts every call, and builders that write the
 * files the api or CLI would write (account, gates, an approved run, a publish request) into an
 * `fs.mkdtemp` data home. Nothing here opens a real data home, database, Keychain or network.
 */

/** Token-shaped sentinels: never a real token. A test searches files and logs for them (AC 41, 60). */
export const SENTINEL_ACCESS_TOKEN = 'sentinel-access-token-tfxcjevbkd';
export const SENTINEL_REFRESH_TOKEN = 'sentinel-refresh-token-zdhamcwpej';
/** Owner text that lives only in `request.json` and `account.json`; never in a log or event (K7). */
export const SENTINEL_TITLE = 'Titulo sentinela do teste';
export const SENTINEL_CAPTION = 'Legenda sentinela do teste';
export const SENTINEL_TAG = 'tagsentinela';
export const SENTINEL_ACCOUNT_LABEL = 'Rotulo sentinela da conta';

export const START = '2026-11-20T15:00:00.000Z';
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const BIOMETRIC_REF = 'voz-teste@3';
/** A pid parsePid accepts (7 digits) that no process can hold on macOS or Linux. */
export const DEAD_PID = 9_999_999;

/** `@studio/core/platforms` exports the port but not its metrics request type, so it is read off the port. */
type MetricsRequest = Parameters<PlatformClient['fetchMetrics']>[0];

const FIXTURE_RUN = resolve(__dirname, '../../fixtures/product-tour-16x9/run.json');

export class FakeClock implements Clock {
  private nowMs: number;

  constructor(start: string) {
    this.nowMs = Date.parse(start);
  }

  now(): Date {
    return new Date(this.nowMs);
  }

  set(instant: string | number): void {
    this.nowMs = typeof instant === 'number' ? instant : Date.parse(instant);
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }
}

export class UnexpectedPlatformCallError extends Error {
  constructor(operation: string) {
    super(`The watcher must never call ${operation}`);
    this.name = 'UnexpectedPlatformCallError';
  }
}

export interface CallCounts {
  refresh: number;
  upload: number;
  uploadStatus: number;
  fetchMetrics: number;
}

/** Valid `PlatformMetrics` for a pulled row. */
export function sampleMetrics(views: number): PlatformMetrics {
  return {
    views,
    likes: 3,
    comments: 1,
    shares: 0,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
  };
}

/** The platform's own id shape for an upload of `attemptId`. */
export function platformVideoIdFor(platform: Platform, attemptId: string): string {
  if (platform === 'tiktok') return `7${createHash('sha256').update(attemptId).digest('hex').replace(/\D/g, '').padEnd(18, '1').slice(0, 18)}`;
  return attemptId.slice(-11);
}

/** Positional reads from byte 0 through the caller's handle, as the port requires; the path is never opened. */
async function readThroughHandle(request: UploadRequest): Promise<Buffer> {
  const bytes = Buffer.alloc(request.sizeBytes);
  let total = 0;
  while (total < request.sizeBytes) {
    const { bytesRead } = await request.file.read(bytes, total, request.sizeBytes - total, total);
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  return bytes.subarray(0, total);
}

/**
 * The double of one platform's client. Every call is counted; the refresh returns the sentinel
 * tokens, the upload reads the bytes through the
 * caller's file handle and reports progress, the metrics call answers `ok`.
 * Hooks let a test act at the exact moment the watcher calls the platform.
 */
export class FakePlatformClient implements PlatformClient {
  readonly mode: PlatformClient['mode'] = 'mock';
  readonly pkce: PlatformClient['pkce'] = 'none';
  readonly calls: CallCounts = { refresh: 0, upload: 0, uploadStatus: 0, fetchMetrics: 0 };
  readonly uploadRequests: UploadRequest[] = [];
  /** The bytes each upload read through `request.file`, the handle the watcher hashed (finding S2). */
  readonly uploadedBytes: Buffer[] = [];
  readonly metricsRequests: MetricsRequest[] = [];
  /** Popped per refresh; an empty queue (or undefined) refreshes successfully. */
  readonly refreshFailures: (Error | undefined)[] = [];
  onRefresh: (() => Promise<void>) | null = null;
  onUpload: ((request: UploadRequest) => Promise<void>) | null = null;
  /** Runs inside `fetchMetrics` after the request is recorded; a rejection is the client's failure. */
  onFetchMetrics: ((request: MetricsRequest) => Promise<void>) | null = null;
  uploadFailure: Error | null = null;
  uploadOutcome: ((request: UploadRequest) => UploadOutcome) | null = null;
  metricsFailure: Error | null = null;
  metricsAnswer: ((request: MetricsRequest) => MetricResult[]) | null = null;
  statusAnswer: UploadStatus = { state: 'processing' };

  constructor(readonly platform: Platform) {}

  scopesFor(): string[] {
    return [];
  }

  authorizeUrl(): string {
    throw new UnexpectedPlatformCallError('authorizeUrl');
  }

  async exchangeCode(): Promise<TokenBundle> {
    throw new UnexpectedPlatformCallError('exchangeCode');
  }

  async fetchIdentity(): Promise<never> {
    throw new UnexpectedPlatformCallError('fetchIdentity');
  }

  async revoke(): Promise<void> {
    throw new UnexpectedPlatformCallError('revoke');
  }

  async refresh(tokens: TokenBundle, _credentials: PlatformClientCredentials | null, now: Date): Promise<TokenBundle> {
    this.calls.refresh += 1;
    if (this.onRefresh !== null) await this.onRefresh();
    const failure = this.refreshFailures.shift();
    if (failure !== undefined) throw failure;
    return {
      ...tokens,
      accessToken: new SecretToken(SENTINEL_ACCESS_TOKEN),
      accessExpiresAt: new Date(now.getTime() + HOUR_MS).toISOString(),
      refreshToken: new SecretToken(SENTINEL_REFRESH_TOKEN),
      obtainedAt: now.toISOString(),
    };
  }

  async upload(request: UploadRequest): Promise<UploadOutcome> {
    this.calls.upload += 1;
    this.uploadRequests.push(request);
    if (this.onUpload !== null) await this.onUpload(request);
    if (this.uploadFailure !== null) throw this.uploadFailure;
    const bytes = await readThroughHandle(request);
    this.uploadedBytes.push(bytes);
    request.onProgress(bytes.length);
    if (this.uploadOutcome !== null) return this.uploadOutcome(request);
    const platformVideoId = platformVideoIdFor(this.platform, request.attemptId);
    if (this.platform === 'tiktok') return { state: 'sent-to-inbox', uploadRef: platformVideoId };
    return { state: 'published', platformVideoId, platformMediaId: null, publishedAt: request.now.toISOString() };
  }

  async uploadStatus(): Promise<UploadStatus> {
    this.calls.uploadStatus += 1;
    return this.statusAnswer;
  }

  async fetchMetrics(request: MetricsRequest): Promise<MetricResult[]> {
    this.calls.fetchMetrics += 1;
    this.metricsRequests.push(request);
    if (this.onFetchMetrics !== null) await this.onFetchMetrics(request);
    if (this.metricsFailure !== null) throw this.metricsFailure;
    if (this.metricsAnswer !== null) return this.metricsAnswer(request);
    return request.targets.map((target): MetricResult => ({ publicationId: target.publicationId, status: 'ok', metrics: sampleMetrics(100 + target.dayIndex), platformMediaId: null }));
  }

  publicationUrl(): string | null {
    throw new UnexpectedPlatformCallError('publicationUrl');
  }
}

export function fakeClients(): Record<Platform, FakePlatformClient> {
  return { youtube: new FakePlatformClient('youtube'), instagram: new FakePlatformClient('instagram'), tiktok: new FakePlatformClient('tiktok') };
}

/** The local calendar day `days` before `now` (negative goes forward), as the poll counts days. */
export function localDayBefore(now: Date, days: number): string {
  const instant = new Date(now.getTime());
  instant.setDate(instant.getDate() - days);
  return localDateOf(instant);
}

/** The api's or CLI's connect: `account.json` (the test plays the api). */
export async function connectAccount(
  platformRoot: string,
  options: { platform: Platform; connectionId: string; at: Date; state?: AccountFile['state']; mode?: AccountFile['mode'] },
): Promise<AccountFile> {
  const state = options.state ?? 'connected';
  const account: AccountFile = {
    format: 1,
    platform: options.platform,
    connectionId: options.connectionId,
    state,
    mode: options.mode ?? 'mock',
    accountLabel: SENTINEL_ACCOUNT_LABEL,
    platformAccountId: 'test-account-1',
    scopes: [],
    capabilities: ['metrics', 'publish'],
    connectedAt: options.at.toISOString(),
    connectedBy: 'owner',
    disconnectedAt: state === 'disconnected' ? options.at.toISOString() : null,
    correlationId: null,
  };
  await writeAccountFile(platformRoot, account);
  return account;
}

/** The owner's gate changes: `gates.json` over `defaultGates` (the test plays the api). */
export async function setGates(platformRoot: string, changes: Partial<Record<Platform, PlatformGates>>, at: Date): Promise<void> {
  await writeGatesFile(platformRoot, { format: 1, gates: { ...defaultGates, ...changes }, updatedAt: at.toISOString(), updatedBy: 'owner' });
}

export interface ApprovedRun {
  runId: string;
  runDir: string;
  videoPath: string;
  sha256: string;
  sizeBytes: number;
  approvedAt: string;
}

const VIDEO_BYTES = 4096;

export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** An `approved` run: `run.json`, the final decision in `approval.json`, `manifest.json` and `final.mp4`. */
export async function writeApprovedRun(runsRoot: string, at: Date): Promise<ApprovedRun> {
  const fixture: RunFile = RunFileSchema.parse(JSON.parse(await readFile(FIXTURE_RUN, 'utf8')));
  const runId = newUlid(at.getTime() - DAY_MS);
  const runDir = runDirectory(runsRoot, runId);
  const approvedAt = new Date(at.getTime() - HOUR_MS).toISOString();
  await mkdir(runDir, { recursive: true });
  await writeRunFile(runDir, { ...fixture, runId, state: { status: 'approved', since: approvedAt, decidedBy: 'owner' } });
  await writeApprovalFile(runDir, {
    runId,
    decisions: [{ kind: 'final', outcome: 'approved', decidedBy: 'owner', decidedAt: approvedAt, notes: '', correlationId: null, rating: 5, checklist: [] }],
  });
  const video = Buffer.alloc(VIDEO_BYTES, 7);
  const videoPath = join(runDir, runFileNames.finalVideo);
  await writeFile(videoPath, video);
  const sha256 = sha256Of(video);
  await writeRunManifest(runDir, {
    format: 1,
    runId,
    createdAt: fixture.createdAt,
    recipe: { ref: fixture.recipe.ref, contentHash: fixture.recipe.contentHash },
    assets: [],
    references: [],
    parameters: { brief: fixture.brief, stages: [] },
    models: [],
    outputs: [{ name: 'final-video', path: runFileNames.finalVideo, contentHash: sha256, sizeBytes: VIDEO_BYTES }],
    egress: [],
  });
  return { runId, runDir, videoPath, sha256, sizeBytes: VIDEO_BYTES, approvedAt };
}

/** `RequestPublish` step 9: `publish/<attemptId>/request.json`, written once (the test plays the api). */
export async function queuePublishRequest(
  platformRoot: string,
  options: { run: ApprovedRun; platform: Platform; connectionId: string; at: Date; ttlMs?: number; visibility?: Visibility },
): Promise<PublishRequestFile> {
  const { run, at } = options;
  const request: PublishRequestFile = {
    format: 1,
    attemptId: newUlid(at.getTime()),
    runId: run.runId,
    platform: options.platform,
    connectionId: options.connectionId,
    mode: 'mock',
    requestedAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + (options.ttlMs ?? 2 * HOUR_MS)).toISOString(),
    requestedBy: 'owner',
    createdBy: 'api',
    correlationId: null,
    artifact: { sha256: run.sha256, sizeBytes: run.sizeBytes },
    approvalDecidedAt: run.approvedAt,
    metadata: { title: SENTINEL_TITLE, caption: SENTINEL_CAPTION, tags: [SENTINEL_TAG], visibility: options.visibility ?? 'private', aiDisclosure: false },
    biometric: { refs: [BIOMETRIC_REF], confirmedAt: at.toISOString() },
  };
  await createPublishRequest(platformRoot, request);
  return request;
}
