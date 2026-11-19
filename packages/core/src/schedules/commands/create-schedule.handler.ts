import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type ScheduleView } from '@studio/shared/api';
import { newUlid } from '@studio/shared/run-files';
import { resolveLimits } from '@studio/shared/run-format';
import { SCHEDULE_FORMAT_VERSION, ScheduleFileSchema, ScheduleIdSchema, scheduleBounds, type ScheduleFile } from '@studio/shared/schedules';
import { toScheduleBriefs } from '../schedule-brief.mapper';
import { consentMatches, hasFutureSlot } from '../schedule-policy';
import { ScheduleRecipeGate } from '../schedule-recipe.gate';
import { ScheduleStore } from '../schedule-store';
import { ScheduleViewAssembler } from '../schedule-view.assembler';
import { ScheduleWriter } from '../schedule-writer';
import { emptySlotLogSummary } from '../slot-log-summary';
import { ScheduleError, ScheduleEstimateChangedError, ScheduleLimitReachedError, ScheduleTimeInvalidError } from '../schedules.errors';
import { parseCreateScheduleInput, type CreateScheduleFields } from '../schedule.input';
import { CreateScheduleCommand } from './create-schedule.command';

/**
 * SPEC 0006 section 5.5. Refusal order follows the frozen C10 contract (`CreateScheduleRequestSchema`):
 * time, limit, recipe, consent; then step 6 writes `schedule.json` exclusively at `active`. Runs only
 * in the api or the CLI; the watcher's graph has no command handler.
 */
@CommandHandler(CreateScheduleCommand)
export class CreateScheduleHandler implements ICommandHandler<CreateScheduleCommand, ScheduleView> {
  private readonly logger = new Logger(CreateScheduleHandler.name);

  constructor(
    private readonly store: ScheduleStore,
    private readonly writer: ScheduleWriter,
    private readonly recipes: ScheduleRecipeGate,
    private readonly assembler: ScheduleViewAssembler,
  ) {}

  async execute(command: CreateScheduleCommand): Promise<ScheduleView> {
    const fields = parseCreateScheduleInput(command.input);
    try {
      // The limit count and the folder creation must not interleave within this process.
      return await this.writer.exclusive(() => this.create(fields));
    } catch (error) {
      if (error instanceof ScheduleError) {
        this.logger.log({ event: 'schedule.refused-create', correlationId: fields.correlationId, reason: error.reason });
      }
      throw error;
    }
  }

  private async create(fields: CreateScheduleFields): Promise<ScheduleView> {
    const { request } = fields;
    const now = new Date();
    if (!hasFutureSlot(request, now)) throw new ScheduleTimeInvalidError('no-future-slot');

    // An unreadable schedule still holds its place: the limit fails closed.
    const existing = (await this.store.listAll()).filter((stored) => stored.state === 'unreadable' || stored.file.status !== 'deleted').length;
    if (existing >= scheduleBounds.maxSchedules) throw new ScheduleLimitReachedError(existing);

    const version = await this.recipes.runnableVersion(request.recipeRef, request.briefs);
    const { costPerRunUsd } = resolveLimits(version.recipe.limits);
    if (!consentMatches(request.acceptedWorstCasePerRunUsd, costPerRunUsd)) {
      throw new ScheduleEstimateChangedError(request.acceptedWorstCasePerRunUsd, costPerRunUsd);
    }

    const timestamp = now.toISOString();
    const file: ScheduleFile = ScheduleFileSchema.parse({
      format: SCHEDULE_FORMAT_VERSION,
      scheduleId: ScheduleIdSchema.parse(newUlid(now.getTime())),
      title: request.title,
      status: 'active',
      statusSince: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: fields.createdBy,
      correlationId: fields.correlationId,
      recipeRef: version.ref,
      recurrence: request.recurrence,
      timezone: request.timezone,
      briefMode: request.briefMode,
      briefs: toScheduleBriefs(request.briefs, now),
      costConsent: { perRunUsd: costPerRunUsd, acceptedAt: timestamp },
    });
    await this.writer.create(file);
    this.logger.log({
      event: 'schedule.created',
      scheduleId: file.scheduleId,
      recipeRef: file.recipeRef,
      recurrenceKind: file.recurrence.kind,
      briefs: file.briefs.length,
      correlationId: file.correlationId,
    });
    return this.assembler.viewOf({ file, slots: emptySlotLogSummary(), detail: 'detail', now });
  }
}
