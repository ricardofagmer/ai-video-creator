import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateScheduleCommand, GetScheduleQuery, ListSchedulesQuery, PatchScheduleCommand } from '@studio/core/schedules';
import {
  PatchScheduleRequestSchema,
  ScheduleParamsSchema,
  apiRouteSegments,
  type CreateScheduleRequest,
  type PatchScheduleRequest,
  type ScheduleListView,
  type ScheduleParams,
  type ScheduleView,
} from '@studio/shared/api';
import { RequestContext } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { CreateScheduleBodyPipe } from './create-schedule-body.pipe';
import { FiredRunIndexSync } from './fired-run-index.sync';

/** The two commands this controller dispatches (the command bus satisfies it). */
export interface ScheduleCommandPort {
  execute(command: CreateScheduleCommand | PatchScheduleCommand): Promise<ScheduleView>;
}

/** The two queries this controller dispatches (the query bus satisfies it). */
export interface ScheduleQueryPort {
  execute(query: GetScheduleQuery): Promise<ScheduleView>;
  execute(query: ListSchedulesQuery): Promise<ScheduleListView>;
}

/**
 * Schedules (SPEC 0006 sections 4.4, 5.5, 5.7; C10 rev 5). Every route sits behind the global
 * session guard and, for the writes, the `Origin` allowlist of `HostOriginMiddleware`. The api
 * writes only `schedule.json`, through core's schedule commands; it never writes `cursor.json`,
 * `slots.jsonl` or a run, and no route sets a run status (K2, K3). `createdBy` is `api` and
 * `correlationId` comes from `x-request-id`, never from the body. Titles and briefs are passed to
 * core and never logged here (K7).
 */
@Controller(apiRouteSegments.schedules)
export class SchedulesController {
  constructor(
    @Inject(CommandBus) private readonly commands: ScheduleCommandPort,
    @Inject(QueryBus) private readonly queries: ScheduleQueryPort,
    private readonly context: RequestContext,
    private readonly firedRuns: FiredRunIndexSync,
  ) {}

  /**
   * Every schedule not `deleted`, briefs as ids and titles only. Fired runs seen since the last
   * look are indexed first, so the runs they link to are listed by `GET /runs` (section 5.7).
   */
  @Get()
  async list(): Promise<ScheduleListView> {
    await this.firedRuns.syncFiredRuns();
    return this.queries.execute(new ListSchedulesQuery());
  }

  /**
   * Section 5.5, first failure refuses and nothing is written: 422 `schedule-time-invalid`,
   * `schedule-limit-reached` (10 not `deleted`), `schedule-recipe-not-runnable`; 409
   * `schedule-estimate-changed` when the consent is not the pinned recipe's per-run ceiling to the cent.
   */
  @Post()
  @HttpCode(201)
  create(@Body(new CreateScheduleBodyPipe()) body: CreateScheduleRequest): Promise<ScheduleView> {
    return this.commands.execute(new CreateScheduleCommand({ request: body, createdBy: 'api', correlationId: this.context.correlationId() }));
  }

  /** 404 `schedule-not-found`; a `deleted` schedule is answered too. */
  @Get(':scheduleId')
  get(@Param(new ZodValidationPipe(ScheduleParamsSchema)) params: ScheduleParams): Promise<ScheduleView> {
    return this.queries.execute(new GetScheduleQuery(params.scheduleId));
  }

  /**
   * Pause, resume, delete, add briefs or remove a brief: one atomic rewrite of `schedule.json`.
   * 404 `schedule-not-found`; 409 `schedule-not-editable` (deleted), `schedule-brief-change-refused`.
   */
  @Patch(':scheduleId')
  @HttpCode(200)
  patch(
    @Param(new ZodValidationPipe(ScheduleParamsSchema)) params: ScheduleParams,
    @Body(new ZodValidationPipe(PatchScheduleRequestSchema)) body: PatchScheduleRequest,
  ): Promise<ScheduleView> {
    return this.commands.execute(new PatchScheduleCommand({ scheduleId: params.scheduleId, request: body, correlationId: this.context.correlationId() }));
  }
}
