import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CreateScheduleCommand,
  GetScheduleQuery,
  ListSchedulesQuery,
  PatchScheduleCommand,
  ScheduleEstimateChangedError,
  ScheduleLimitReachedError,
  ScheduleTimeInvalidError,
} from '@studio/core/schedules';
import { type CreateScheduleRequest, type ScheduleListView, type ScheduleView } from '@studio/shared/api';
import { type JsonLinesPage } from '@studio/shared/run-files';
import { type ScheduleId, type SlotLine } from '@studio/shared/schedules';
import { RequestValidationError } from '../platform/api.errors';
import { mapError } from '../platform/error-mapping';
import { RequestContext } from '../platform/request-context';
import { CreateScheduleBodyPipe } from './create-schedule-body.pipe';
import { FiredRunIndexSync } from './fired-run-index.sync';
import { SchedulesController, type ScheduleCommandPort, type ScheduleQueryPort } from './schedules.controller';
import { SlotTailReader } from './slot-tail.reader';

const CORRELATION_ID = 'req-schedules-1';

const createBody = {
  title: 'Weekly tips',
  recipeRef: 'short-tips@3',
  recurrence: { kind: 'weekly', weekdays: [3], time: '09:00' },
  timezone: 'America/Sao_Paulo',
  briefMode: 'queue',
  briefs: [{ brief: { topic: 'Three editing tips', keyMessages: ['Cut on action'], format: '9:16', language: 'pt-BR', targetDurationSec: 45 }, references: [] }],
  acceptedWorstCasePerRunUsd: 3,
};

/** Simulates the core create handler's refusals: the controller must pass them through unchanged. */
class RefusingScheduleCommands implements ScheduleCommandPort {
  readonly received: (CreateScheduleCommand | PatchScheduleCommand)[] = [];

  constructor(private readonly refusal: Error) {}

  async execute(command: CreateScheduleCommand | PatchScheduleCommand): Promise<ScheduleView> {
    this.received.push(command);
    throw this.refusal;
  }
}

const noQueries: ScheduleQueryPort = {
  execute: (): Promise<never> => Promise.reject(new Error('no query is expected')),
};

/** No schedule folders: the fired-run sync has nothing to read. */
const emptySlotLogs = {
  listAll: async (): Promise<{ scheduleId: ScheduleId }[]> => [],
  readSlotLinesFrom: async (): Promise<JsonLinesPage<SlotLine>> => ({ entries: [], nextByte: 0, pendingTailBytes: 0 }),
};

const noRunIndex = { execute: async (): Promise<null> => null };

/** Answers the list query with no schedules and records when it was asked. */
class EmptyListQueries implements ScheduleQueryPort {
  constructor(private readonly order: string[]) {}

  execute(query: GetScheduleQuery): Promise<ScheduleView>;
  execute(query: ListSchedulesQuery): Promise<ScheduleListView>;
  async execute(query: GetScheduleQuery | ListSchedulesQuery): Promise<ScheduleView | ScheduleListView> {
    if (query instanceof GetScheduleQuery) throw new Error('no get query is expected');
    this.order.push('list');
    return [];
  }
}

function parsedBody(): CreateScheduleRequest {
  return new CreateScheduleBodyPipe().transform(createBody);
}

async function createWith(refusal: Error): Promise<{ error: unknown; commands: RefusingScheduleCommands }> {
  const commands = new RefusingScheduleCommands(refusal);
  const context = new RequestContext();
  const controller = new SchedulesController(commands, noQueries, context, new FiredRunIndexSync(new SlotTailReader(emptySlotLogs), noRunIndex));
  const body = parsedBody();
  const error = await new Promise<unknown>((resolve) => {
    context.run({ correlationId: CORRELATION_ID, principal: null }, () => {
      controller.create(body).then(
        () => resolve(new Error('the schedule was created')),
        (refused: unknown) => resolve(refused),
      );
    });
  });
  return { error, commands };
}

describe('POST /schedules refusals (SPEC 0006 section 5.5, R3-AC-18)', () => {
  it('answers 409 schedule-estimate-changed when the consent is not the per-run ceiling', async () => {
    const { error, commands } = await createWith(new ScheduleEstimateChangedError(2.99, 3));
    assert.ok(error instanceof ScheduleEstimateChangedError);
    const mapped = mapError(error);
    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.reason, 'schedule-estimate-changed');
    assert.equal(commands.received.length, 1);
  });

  it('answers 422 schedule-limit-reached for an 11th schedule', async () => {
    const { error } = await createWith(new ScheduleLimitReachedError(10));
    assert.ok(error instanceof ScheduleLimitReachedError);
    const mapped = mapError(error);
    assert.equal(mapped.statusCode, 422);
    assert.equal(mapped.reason, 'schedule-limit-reached');
  });

  it('dispatches createdBy api and the x-request-id, never a body field, to core', async () => {
    const { commands } = await createWith(new ScheduleLimitReachedError(10));
    const [command] = commands.received;
    assert.ok(command instanceof CreateScheduleCommand);
    assert.equal(command.input.createdBy, 'api');
    assert.equal(command.input.correlationId, CORRELATION_ID);
    assert.deepEqual(command.input.request, parsedBody());
  });
});

describe('POST /schedules body validation', () => {
  it('answers 422 schedule-time-invalid for a zone the runtime does not know', () => {
    assert.throws(
      () => new CreateScheduleBodyPipe().transform({ ...createBody, timezone: 'Mars/Olympus_Mons' }),
      (error: unknown) => error instanceof ScheduleTimeInvalidError && mapError(error).statusCode === 422 && mapError(error).reason === 'schedule-time-invalid',
    );
  });

  it('answers 422 schedule-time-invalid for a malformed recurrence', () => {
    assert.throws(
      () => new CreateScheduleBodyPipe().transform({ ...createBody, recurrence: { kind: 'daily', time: '25:00' } }),
      (error: unknown) => error instanceof ScheduleTimeInvalidError,
    );
  });

  it('answers 400 for any other shape problem, without echoing values', () => {
    assert.throws(
      () => new CreateScheduleBodyPipe().transform({ ...createBody, createdBy: 'someone-else' }),
      (error: unknown) => error instanceof RequestValidationError && mapError(error).statusCode === 400 && !JSON.stringify(mapError(error)).includes('someone-else'),
    );
  });
});

describe('GET /schedules', () => {
  it('syncs fired runs before reading the list', async () => {
    const order: string[] = [];
    const slotLogs = {
      listAll: async (): Promise<{ scheduleId: ScheduleId }[]> => {
        order.push('slot-logs');
        return [];
      },
      readSlotLinesFrom: emptySlotLogs.readSlotLinesFrom,
    };
    const controller = new SchedulesController(
      new RefusingScheduleCommands(new Error('unused')),
      new EmptyListQueries(order),
      new RequestContext(),
      new FiredRunIndexSync(new SlotTailReader(slotLogs), noRunIndex),
    );
    assert.deepEqual(await controller.list(), []);
    assert.deepEqual(order, ['slot-logs', 'list']);
  });
});
