import 'reflect-metadata';
import { inspect } from 'node:util';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataHome } from '@studio/core/paths';
import {
  AccountStore,
  GateStore,
  HealthReader,
  InMemoryPlatformTokenVault,
  PLATFORM_CLIENTS,
  PLATFORM_CLOCK,
  PLATFORM_FILE_ROOT,
  PLATFORM_MODE_SETTINGS,
  PLATFORM_PROCESS_ID,
  PLATFORM_TOKEN_VAULT,
  PlatformCredentials,
  PlatformStatusReader,
  TokenLock,
  type CredentialsLookup,
  type PlatformClients,
  type PlatformModeSettings,
  type PlatformModeState,
  type TokenBundle,
  type TokenVaultCallOptions,
} from '@studio/core/platforms';
import { PrismaService } from '@studio/core/prisma';
import { Secret } from '@studio/core/secrets';
import { type Platform, type PublishAttemptId, type PublishRequestFile, type PublishStateFile, type RunPublicationLine } from '@studio/shared/platforms';
import { listPublishAttemptIds, publishMetadataSha256, readPublishClaim, readPublishRequest, readPublishState } from '@studio/shared/platforms/files';
import { newUlid, readRunPublicationLines, runDirectory } from '@studio/shared/run-files';
import { CLOCK } from '../engine/engine.tokens';
import { MetricsPollStep } from './metrics-poll.step';
import { PlatformEventRecorder, type PlatformEvent } from './platform-event.recorder';
import { PlatformHealthWriter } from './platform-health.writer';
import { PlatformTokenSession } from './platform-token.session';
import { PublicationAttemptReader, type PublicationAttemptRow, type WithdrawnAttemptRow } from './publication-attempt.reader';
import { PublicationTargetsReader } from './publication-targets.reader';
import { PublishAttemptFiles } from './publish-attempt.files';
import { PublishCloser } from './publish-closer';
import { PublishFollowUp } from './publish-follow-up';
import { PublishRecheck } from './publish-recheck';
import { PublishUploader } from './publish-uploader';
import { PublishStep } from './publish.step';
import { RunApprovalReader } from './run-approval.reader';
import {
  DAY_MS,
  FakeClock,
  START,
  connectAccount,
  fakeClients,
  writeApprovedRun,
  type ApprovedRun,
  type FakePlatformClient,
} from './platform-fixtures.harness.test';

/*
 * The watcher's real platform providers (publish step, metrics poll, token session and every
 * collaborator), resolved by Nest DI over an `fs.mkdtemp` data home, as `slot-facts.month-spend`
 * does for its collector. Doubles sit at the boundaries only: the platform clients, the token
 * vault (`InMemoryPlatformTokenVault`), the clock, the OAuth client credentials and SQLite, whose
 * double answers the reads the watcher makes and records (then throws on) every write (AC 57).
 * The `publication_attempts` row is the one the api recorded with `request.json` (finding S3),
 * unless a test edits it through `attemptRowEdit`.
 * The event recorder and the Nest logger capture everything for the K7 and sentinel assertions.
 */

export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];

  log(...args: unknown[]): void {
    this.capture(args);
  }

  error(...args: unknown[]): void {
    this.capture(args);
  }

  warn(...args: unknown[]): void {
    this.capture(args);
  }

  debug(...args: unknown[]): void {
    this.capture(args);
  }

  verbose(...args: unknown[]): void {
    this.capture(args);
  }

  private capture(args: unknown[]): void {
    this.lines.push(inspect(args, { depth: 8 }));
  }
}

/** Keeps every event and still writes it through the real recorder, so the logger sees the line. */
export class CapturingPlatformEvents extends PlatformEventRecorder {
  readonly events: PlatformEvent[] = [];

  override record(event: PlatformEvent): void {
    this.events.push(event);
    super.record(event);
  }

  ofType(type: PlatformEvent['type']): PlatformEvent[] {
    return this.events.filter((event) => event.type === type);
  }
}

/** The in-memory Keychain, also keeping the `timeoutMs` each write was given (findings S1, C5). */
export class RecordingTokenVault extends InMemoryPlatformTokenVault {
  readonly writeTimeouts: (number | undefined)[] = [];

  override async write(bundle: TokenBundle, options?: TokenVaultCallOptions): Promise<void> {
    this.writeTimeouts.push(options?.timeoutMs);
    await super.write(bundle);
  }
}

export class PrismaWriteForbiddenError extends Error {
  constructor(operation: string) {
    super(`The watcher never writes SQLite (K1): ${operation}`);
    this.name = 'PrismaWriteForbiddenError';
  }
}

/** One `run_publications` row as `PublicationTargetsReader` selects it. */
export interface PublicationRow {
  id: string;
  platform: string;
  platformVideoId: string;
  publishedOn: string | null;
  recordedAt: Date;
  origin: string;
  platformMediaId: string | null;
}

/** The `publication_attempts` row `RequestPublish` writes together with `request.json`. */
export function attemptRowOf(request: PublishRequestFile): PublicationAttemptRow {
  return {
    state: 'queued',
    runId: request.runId,
    platform: request.platform,
    connectionId: request.connectionId,
    mode: request.mode,
    artifactSha256: request.artifact.sha256,
    artifactBytes: BigInt(request.artifact.sizeBytes),
    visibility: request.metadata.visibility,
    aiDisclosure: request.metadata.aiDisclosure,
    metadataSha256: publishMetadataSha256(request.metadata),
    biometricRefsJson: JSON.stringify(request.biometric.refs),
    biometricConfirmedAt: new Date(request.biometric.confirmedAt),
    approvalDecidedAt: new Date(request.approvalDecidedAt),
    expiresAt: new Date(request.expiresAt),
  };
}

/** The query of `PublicationAttemptReader.recentlyWithdrawnOf`, the one attempt list the watcher reads. */
interface WithdrawnAttemptsQuery {
  where: { runId: string; platform: string; id: { not: string }; state: { in: string[] }; updatedAt: { gte: Date } };
  take: number;
}

type PrismaWriteMethod = 'create' | 'createMany' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany';

/** The SQLite double: reads answer from fields, every write is recorded and throws. */
export class PrismaDouble {
  readonly writeAttempts: string[] = [];
  outcomeDecision: 'approved' | 'rejected' | null = 'approved';
  publications: PublicationRow[] = [];
  /** Changes (or, returning null, removes) the row read for an attempt; null keeps the api's row. */
  attemptRowEdit: ((row: PublicationAttemptRow) => PublicationAttemptRow | null) | null = null;
  /** A row state other than `queued`, per attempt id, as `PublishAttemptSync` or a cancel left it (finding R2). */
  readonly attemptRowStates = new Map<string, string>();
  /** When a row last changed, per attempt id; `requestedAt` otherwise (finding R2's window). */
  readonly attemptRowUpdatedAt = new Map<string, Date>();

  constructor(private readonly platformRoot: string) {}

  readonly client = {
    runOutcome: {
      ...this.forbiddenWrites('runOutcome'),
      findUnique: async (): Promise<{ decision: string } | null> => (this.outcomeDecision === null ? null : { decision: this.outcomeDecision }),
    },
    runPublication: {
      ...this.forbiddenWrites('runPublication'),
      findMany: async (): Promise<PublicationRow[]> => [...this.publications],
    },
    publicationAttempt: {
      ...this.forbiddenWrites('publicationAttempt'),
      findUnique: async (args: { where: { id: string } }): Promise<PublicationAttemptRow | null> => this.attemptRow(args.where.id),
      findMany: async (args: WithdrawnAttemptsQuery): Promise<WithdrawnAttemptRow[]> => this.withdrawnAttemptRows(args),
    },
    $transaction: (): never => this.forbid('$transaction'),
    $executeRaw: (): never => this.forbid('$executeRaw'),
    $executeRawUnsafe: (): never => this.forbid('$executeRawUnsafe'),
  };

  /** The api wrote the row and `request.json` together: no `request.json`, no row. */
  private async attemptRow(attemptId: string): Promise<PublicationAttemptRow | null> {
    const read = await readPublishRequest(this.platformRoot, attemptId);
    if (read.status !== 'present') return null;
    const row = { ...attemptRowOf(read.value), state: this.attemptRowStates.get(attemptId) ?? 'queued' };
    return this.attemptRowEdit === null ? row : this.attemptRowEdit(row);
  }

  /** Every row the folders imply, filtered as the query asks, newest first. */
  private async withdrawnAttemptRows(query: WithdrawnAttemptsQuery): Promise<WithdrawnAttemptRow[]> {
    const { where } = query;
    const rows: WithdrawnAttemptRow[] = [];
    for (const attemptId of await listPublishAttemptIds(this.platformRoot)) {
      const read = attemptId === where.id.not ? null : await readPublishRequest(this.platformRoot, attemptId);
      if (read === null || read.status !== 'present') continue;
      const row = await this.attemptRow(attemptId);
      const updatedAt = this.attemptRowUpdatedAt.get(attemptId) ?? new Date(read.value.requestedAt);
      const matches = row !== null && row.runId === where.runId && row.platform === where.platform && where.state.in.includes(row.state);
      if (matches && updatedAt.getTime() >= where.updatedAt.gte.getTime()) rows.push({ id: attemptId });
    }
    return rows.sort((left, right) => right.id.localeCompare(left.id)).slice(0, query.take);
  }

  private forbiddenWrites(model: string): Record<PrismaWriteMethod, () => never> {
    const forbid = (method: string) => (): never => this.forbid(`${model}.${method}`);
    return {
      create: forbid('create'),
      createMany: forbid('createMany'),
      update: forbid('update'),
      updateMany: forbid('updateMany'),
      upsert: forbid('upsert'),
      delete: forbid('delete'),
      deleteMany: forbid('deleteMany'),
    };
  }

  private forbid(operation: string): never {
    this.writeAttempts.push(operation);
    throw new PrismaWriteForbiddenError(operation);
  }
}

/** The OAuth client credentials (environment or Keychain in production); `beforeLookup` acts at that moment. */
export class FakeCredentials {
  lookups = 0;
  beforeLookup: (() => Promise<void>) | null = null;

  async lookup(platform: Platform): Promise<CredentialsLookup> {
    this.lookups += 1;
    if (this.beforeLookup !== null) await this.beforeLookup();
    const clientId = new Secret('youtube-oauth-client-id', 'environment', `test-client-id-${platform}`);
    const clientSecret = new Secret('youtube-oauth-client-secret', 'environment', `test-client-secret-${platform}`);
    return { status: 'present', credentials: { clientId, clientSecret } };
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

/** The real attempt files, with a hook right after an O_EXCL claim succeeded (the api's cancel racing it). */
export class HookedAttemptFiles extends PublishAttemptFiles {
  afterClaim: (() => Promise<void>) | null = null;

  override async claim(attemptId: PublishAttemptId): ReturnType<PublishAttemptFiles['claim']> {
    const result = await super.claim(attemptId);
    if (result === 'claimed' && this.afterClaim !== null) await this.afterClaim();
    return result;
  }
}

export interface PlatformHarness {
  root: string;
  dataHome: DataHome;
  platformRoot: string;
  clock: FakeClock;
  vault: RecordingTokenVault;
  clients: Record<Platform, FakePlatformClient>;
  prisma: PrismaDouble;
  credentials: FakeCredentials;
  events: CapturingPlatformEvents;
  logs: CapturingLogger;
  attemptFiles: HookedAttemptFiles;
  publish: PublishStep;
  metricsPoll: MetricsPollStep;
  tokens: PlatformTokenSession;
  close(): Promise<void>;
}

export interface PlatformHarnessOptions {
  /** An existing data home (a second watcher process over the same files); not removed on close. */
  root?: string;
  clock?: FakeClock;
  modes?: Partial<Record<Platform, PlatformModeState>>;
}

const mockMode: PlatformModeState = { mode: 'mock', fault: 'none' };

@Module({})
class PlatformStepsTestModule {}

export async function createPlatformHarness(options: PlatformHarnessOptions = {}): Promise<PlatformHarness> {
  const ownsRoot = options.root === undefined;
  const root = options.root ?? (await mkdtemp(join(tmpdir(), 'watcher-platforms-')));
  const dataHome = new DataHome(root);
  await mkdir(dataHome.runs, { recursive: true });
  await mkdir(dataHome.platform, { recursive: true, mode: 0o700 });
  const clock = options.clock ?? new FakeClock(START);
  const modes: PlatformModeSettings = {
    youtube: options.modes?.youtube ?? mockMode,
    instagram: options.modes?.instagram ?? mockMode,
    tiktok: options.modes?.tiktok ?? mockMode,
  };
  const vault = new RecordingTokenVault();
  const clients = fakeClients();
  const registry: PlatformClients = { clientFor: (platform) => clients[platform] };
  const prisma = new PrismaDouble(dataHome.platform);
  const credentials = new FakeCredentials();
  const events = new CapturingPlatformEvents();
  const logs = new CapturingLogger();
  const attemptFiles = new HookedAttemptFiles(dataHome.platform, process.pid, dataHome);
  const app = await NestFactory.createApplicationContext(
    {
      module: PlatformStepsTestModule,
      providers: [
        { provide: DataHome, useValue: dataHome },
        { provide: PLATFORM_FILE_ROOT, useValue: dataHome.platform },
        { provide: PLATFORM_PROCESS_ID, useValue: process.pid },
        { provide: PLATFORM_CLOCK, useValue: clock },
        { provide: CLOCK, useValue: clock },
        { provide: PLATFORM_MODE_SETTINGS, useValue: modes },
        { provide: PLATFORM_TOKEN_VAULT, useValue: vault },
        { provide: PLATFORM_CLIENTS, useValue: registry },
        { provide: PrismaService, useValue: prisma.client },
        { provide: PlatformCredentials, useValue: credentials },
        { provide: PlatformEventRecorder, useValue: events },
        { provide: PublishAttemptFiles, useValue: attemptFiles },
        GateStore,
        AccountStore,
        HealthReader,
        TokenLock,
        PlatformStatusReader,
        PlatformHealthWriter,
        PlatformTokenSession,
        RunApprovalReader,
        PublicationAttemptReader,
        PublishRecheck,
        PublishCloser,
        PublishFollowUp,
        PublishUploader,
        PublishStep,
        PublicationTargetsReader,
        MetricsPollStep,
      ],
    },
    // abortOnError false: a resolution failure fails the test instead of exiting the process.
    { logger: logs, abortOnError: false },
  );
  return {
    root,
    dataHome,
    platformRoot: dataHome.platform,
    clock,
    vault,
    clients,
    prisma,
    credentials,
    events,
    logs,
    attemptFiles,
    publish: app.get(PublishStep),
    metricsPoll: app.get(MetricsPollStep),
    tokens: app.get(PlatformTokenSession),
    close: async (): Promise<void> => {
      await app.close();
      if (ownsRoot) await rm(root, { recursive: true, force: true });
    },
  };
}

export async function stateOf(harness: PlatformHarness, attemptId: PublishAttemptId): Promise<PublishStateFile | null> {
  const read = await readPublishState(harness.platformRoot, attemptId);
  return read.status === 'present' ? read.value : null;
}

export async function publicationLines(harness: PlatformHarness, runId: string): Promise<RunPublicationLine[]> {
  return (await readRunPublicationLines(runDirectory(harness.dataHome.runs, runId))).entries;
}

export async function claimExists(harness: PlatformHarness, attemptId: PublishAttemptId): Promise<boolean> {
  return (await readPublishClaim(harness.platformRoot, attemptId)).status === 'present';
}

/** A connected account in mock mode and an approved run, ready for one publish request. */
export async function prepareRun(harness: PlatformHarness, platform: Platform): Promise<{ connectionId: string; run: ApprovedRun }> {
  const at = harness.clock.now();
  const connectionId = newUlid(at.getTime() - DAY_MS);
  await connectAccount(harness.platformRoot, { platform, connectionId, at });
  const run = await writeApprovedRun(harness.dataHome.runs, at);
  return { connectionId, run };
}
