import 'reflect-metadata';
import { Module, type LoggerService, type Provider } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, CommandHandler, CqrsModule, QueryBus, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetRunPublicationsQuery } from '@studio/core/metrics';
import {
  CancelPublishCommand,
  CompleteConnectionCommand,
  DisconnectCommand,
  GetPlatformsQuery,
  GetRunPublishQuery,
  RequestPublishCommand,
  SetPlatformGateCommand,
  StartConnectionCommand,
  type ConnectionCompleted,
  type RequestPublishResult,
} from '@studio/core/platforms';
import {
  type ConnectionStartView,
  type DisconnectResult,
  type PlatformView,
  type PlatformsView,
  type PublishAttemptView,
  type RunPublicationsView,
  type RunPublishView,
} from '@studio/shared/api';
import { type Platform } from '@studio/shared/platforms';
import { OWNER_SUBJECT, type Principal } from '../platform/request-context';

/*
 * Test-only harness for the C10 rev 7 controllers (SPEC 0007 R4-04). The controllers take Nest's
 * concrete `CommandBus` and `QueryBus`, so a real CQRS bus is booted in a Nest application context
 * (no http listener, no network) with in-memory handlers standing in for core's: they record every
 * message and answer what the test scripts. Core itself (SQLite, the Keychain, the platform
 * clients) is never reached.
 */

export const WEB_ORIGIN = 'http://127.0.0.1:4310';
export const API_PORT = 4311;
export const RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
export const ATTEMPT_ID = '01JDA700000000000000000AT1';
export const IDEMPOTENCY_KEY = '01JDA700000000000000000KY1';
export const ARTIFACT_SHA256 = 'a'.repeat(64);

/** Sentinel values: a test fails if any of them reaches a response, a redirect or a log line. */
export const SENTINEL_TOKEN = 'sentinel-access-token-qfxazk';
export const SENTINEL_CLIENT_SECRET = 'sentinel-client-secret-wbvcqe';
export const SENTINEL_TITLE = 'Sentinel title 9d1e40';
export const SENTINEL_CAPTION = 'Sentinel caption 3b77aa';
export const SENTINEL_TAG = 'sentineltag61f0';

export const principal: Principal = { subject: OWNER_SUBJECT, sessionId: 'session-under-test-01', expiresAt: '2026-11-21T00:00:00.000Z' };

export function platformView(platform: Platform): PlatformView {
  return {
    platform,
    mode: 'mock',
    gates: { metrics: 'enabled', publish: platform === 'instagram' ? 'awaiting-review' : 'enabled' },
    status: { metrics: 'connected', publish: platform === 'instagram' ? 'unsupported' : 'connected' },
    reconnectReason: null,
    accountLabel: 'Conta simulada',
    connectedAt: '2026-11-20T10:00:00.000Z',
    lastPollAt: null,
    backoff: null,
    trackedPublications: 0,
    importFallback: true,
  };
}

export function platformsView(): PlatformsView {
  return { platforms: [platformView('youtube'), platformView('instagram'), platformView('tiktok')] };
}

export function attemptView(): PublishAttemptView {
  return {
    attemptId: ATTEMPT_ID,
    runId: RUN_ID,
    platform: 'youtube',
    mode: 'mock',
    state: 'queued',
    since: '2026-11-20T10:00:00.000Z',
    bytesSent: 0,
    bytesTotal: 84_000_000,
    reasonId: null,
    expiresAt: '2026-11-20T12:00:00.000Z',
    publicationId: null,
    requestedAt: '2026-11-20T10:00:00.000Z',
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
    attempts: [attemptView()],
    leftTheMachine: [],
  };
}

/** Collects every Nest log call as JSON text, so a test can search it for sentinel values. */
export class CapturingLogger implements LoggerService {
  readonly entries: string[] = [];

  log(message: unknown, ...rest: unknown[]): void {
    this.record('log', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.record('error', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.record('warn', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.record('debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.record('verbose', message, rest);
  }

  text(): string {
    return this.entries.join('\n');
  }

  private record(level: string, message: unknown, rest: unknown[]): void {
    this.entries.push(JSON.stringify({ level, message, rest }));
  }
}

type Script<Message, Result> = (message: Message) => Promise<Result>;

function unscripted(): Promise<never> {
  return Promise.reject(new Error('no core answer is scripted for this message'));
}

/** What core would answer, per message; every message the bus delivers is kept in `received`. */
export class FakePlatformCore {
  readonly received: object[] = [];
  completeConnection: Script<CompleteConnectionCommand, ConnectionCompleted> = unscripted;
  startConnection: Script<StartConnectionCommand, ConnectionStartView> = unscripted;
  setGate: Script<SetPlatformGateCommand, PlatformView> = unscripted;
  disconnect: Script<DisconnectCommand, DisconnectResult> = unscripted;
  requestPublish: Script<RequestPublishCommand, RequestPublishResult> = unscripted;
  cancelPublish: Script<CancelPublishCommand, PublishAttemptView> = unscripted;
  getPlatforms: Script<GetPlatformsQuery, PlatformsView> = unscripted;
  getRunPublish: Script<GetRunPublishQuery, RunPublishView> = unscripted;
  getRunPublications: Script<GetRunPublicationsQuery, RunPublicationsView> = unscripted;
}

function handlersFor(core: FakePlatformCore): Provider[] {
  @CommandHandler(CompleteConnectionCommand)
  class CompleteConnectionHandler implements ICommandHandler<CompleteConnectionCommand, ConnectionCompleted> {
    execute(command: CompleteConnectionCommand): Promise<ConnectionCompleted> {
      core.received.push(command);
      return core.completeConnection(command);
    }
  }
  @CommandHandler(StartConnectionCommand)
  class StartConnectionHandler implements ICommandHandler<StartConnectionCommand, ConnectionStartView> {
    execute(command: StartConnectionCommand): Promise<ConnectionStartView> {
      core.received.push(command);
      return core.startConnection(command);
    }
  }
  @CommandHandler(SetPlatformGateCommand)
  class SetGateHandler implements ICommandHandler<SetPlatformGateCommand, PlatformView> {
    execute(command: SetPlatformGateCommand): Promise<PlatformView> {
      core.received.push(command);
      return core.setGate(command);
    }
  }
  @CommandHandler(DisconnectCommand)
  class DisconnectHandler implements ICommandHandler<DisconnectCommand, DisconnectResult> {
    execute(command: DisconnectCommand): Promise<DisconnectResult> {
      core.received.push(command);
      return core.disconnect(command);
    }
  }
  @CommandHandler(RequestPublishCommand)
  class RequestPublishHandler implements ICommandHandler<RequestPublishCommand, RequestPublishResult> {
    execute(command: RequestPublishCommand): Promise<RequestPublishResult> {
      core.received.push(command);
      return core.requestPublish(command);
    }
  }
  @CommandHandler(CancelPublishCommand)
  class CancelPublishHandler implements ICommandHandler<CancelPublishCommand, PublishAttemptView> {
    execute(command: CancelPublishCommand): Promise<PublishAttemptView> {
      core.received.push(command);
      return core.cancelPublish(command);
    }
  }
  @QueryHandler(GetPlatformsQuery)
  class GetPlatformsHandler implements IQueryHandler<GetPlatformsQuery, PlatformsView> {
    execute(query: GetPlatformsQuery): Promise<PlatformsView> {
      core.received.push(query);
      return core.getPlatforms(query);
    }
  }
  @QueryHandler(GetRunPublishQuery)
  class GetRunPublishHandler implements IQueryHandler<GetRunPublishQuery, RunPublishView> {
    execute(query: GetRunPublishQuery): Promise<RunPublishView> {
      core.received.push(query);
      return core.getRunPublish(query);
    }
  }
  @QueryHandler(GetRunPublicationsQuery)
  class GetRunPublicationsHandler implements IQueryHandler<GetRunPublicationsQuery, RunPublicationsView> {
    execute(query: GetRunPublicationsQuery): Promise<RunPublicationsView> {
      core.received.push(query);
      return core.getRunPublications(query);
    }
  }
  return [
    CompleteConnectionHandler,
    StartConnectionHandler,
    SetGateHandler,
    DisconnectHandler,
    RequestPublishHandler,
    CancelPublishHandler,
    GetPlatformsHandler,
    GetRunPublishHandler,
    GetRunPublicationsHandler,
  ];
}

@Module({})
class Rev7BusTestModule {}

export interface Rev7Bus {
  commandBus: CommandBus;
  queryBus: QueryBus;
  core: FakePlatformCore;
  /** Nest's logger for the whole process while the context is open, controllers included. */
  logs: CapturingLogger;
  close(): Promise<void>;
}

export async function startRev7Bus(): Promise<Rev7Bus> {
  const core = new FakePlatformCore();
  const logs = new CapturingLogger();
  const app = await NestFactory.createApplicationContext(
    { module: Rev7BusTestModule, imports: [CqrsModule.forRoot()], providers: handlersFor(core) },
    // abortOnError false: a resolution failure fails the test instead of exiting the process.
    { logger: logs, abortOnError: false },
  );
  return { commandBus: app.get(CommandBus), queryBus: app.get(QueryBus), core, logs, close: () => app.close() };
}

/** Awaits a promise that must reject and returns its reason. */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the call was expected to fail and it succeeded');
}
