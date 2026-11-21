import { Command } from '@nestjs/cqrs';
import { type ConnectionStartView, type PlatformView, type PublishAttemptView } from '@studio/shared/api';
import {
  type CancelPublishInput,
  type CompleteConnectionInput,
  type DisconnectInput,
  type RequestPublishInput,
  type SetPlatformGateInput,
  type StartConnectionInput,
} from '../platforms.input';

/*
 * The platform commands (SPEC 0007 sections 5.2 to 5.4), run only by the api and the CLI. Each
 * input is validated by its handler. None is ever registered in the watcher's read module (K1).
 */

/** `PATCH /platforms/:platform/gate`, `studio platforms enable|disable`: the owner's gate change. */
export class SetPlatformGateCommand extends Command<PlatformView> {
  constructor(readonly input: SetPlatformGateInput) {
    super();
  }
}

/** `POST /platforms/:platform/connection`: a single-use `state` and the authorize URL; writes no file. */
export class StartConnectionCommand extends Command<ConnectionStartView> {
  constructor(readonly input: StartConnectionInput) {
    super();
  }
}

/** The callback finished: the new connection's id (the 303 goes to `/contas?resultado=conectada`). */
export interface ConnectionCompleted {
  platform: CompleteConnectionInput['platform'];
  connectionId: string;
}

/** `GET /platforms/:platform/connection/callback`: section 5.2 step 2, first failure stores nothing. */
export class CompleteConnectionCommand extends Command<ConnectionCompleted> {
  constructor(readonly input: CompleteConnectionInput) {
    super();
  }
}

/** `DELETE /platforms/:platform/connection`, `studio platforms disconnect`. */
export class DisconnectCommand extends Command<PlatformView> {
  constructor(readonly input: DisconnectInput) {
    super();
  }
}

/** `created`: a new attempt (202). `existing`: the `idempotencyKey` repeated (200, same view). */
export interface RequestPublishResult {
  outcome: 'created' | 'existing';
  attempt: PublishAttemptView;
}

/** `POST /runs/:runId/publish/:platform`, `studio runs publish`: the nine steps of section 5.4 (K4). */
export class RequestPublishCommand extends Command<RequestPublishResult> {
  constructor(readonly input: RequestPublishInput) {
    super();
  }
}

/** `DELETE /runs/:runId/publish/attempts/:attemptId`: only before the watcher's claim. */
export class CancelPublishCommand extends Command<PublishAttemptView> {
  constructor(readonly input: CancelPublishInput) {
    super();
  }
}

/** Counts of one `PublishAttemptSync` pass; ids are logged per attempt, never URLs. */
export interface PublishSyncSummary {
  open: number;
  updated: number;
  expired: number;
  linked: number;
}

/**
 * `PublishAttemptSync` (section 5.4 "Result"): copies each open attempt's `state.json` into its
 * row, links a `published` one to the run, expires unclaimed requests. Run at api start, before
 * `GET /runs/:runId/publish` and `GET /runs/:runId/publications`, and by the CLI reads.
 * `runId` limits the pass to one run; null syncs every open attempt.
 */
export class SyncPublishAttemptsCommand extends Command<PublishSyncSummary> {
  constructor(readonly runId: string | null) {
    super();
  }
}
