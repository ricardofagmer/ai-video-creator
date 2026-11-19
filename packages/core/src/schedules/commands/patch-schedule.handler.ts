import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PatchScheduleRequest, type ScheduleView } from '@studio/shared/api';
import { ScheduleFileSchema, type ScheduleFile } from '@studio/shared/schedules';
import { toScheduleBriefs } from '../schedule-brief.mapper';
import { changeSchedule, type ScheduleAction } from '../schedule-policy';
import { ScheduleRecipeGate } from '../schedule-recipe.gate';
import { ScheduleStore } from '../schedule-store';
import { ScheduleViewAssembler } from '../schedule-view.assembler';
import { ScheduleWriter } from '../schedule-writer';
import { ScheduleError, ScheduleNotEditableError, ScheduleNotFoundError } from '../schedules.errors';
import { PatchScheduleInputSchema, parseScheduleInput, type PatchScheduleFields } from '../schedule.input';
import { PatchScheduleCommand } from './patch-schedule.command';

/**
 * SPEC 0006 section 5.5: one atomic rewrite of `schedule.json` per action. `deleted` is final; an
 * action already in effect writes nothing. New briefs pass the same recipe checks as at creation.
 * It never touches `cursor.json`, `slots.jsonl` or any run (R3-AC-19, K3).
 */
@CommandHandler(PatchScheduleCommand)
export class PatchScheduleHandler implements ICommandHandler<PatchScheduleCommand, ScheduleView> {
  private readonly logger = new Logger(PatchScheduleHandler.name);

  constructor(
    private readonly store: ScheduleStore,
    private readonly writer: ScheduleWriter,
    private readonly recipes: ScheduleRecipeGate,
    private readonly assembler: ScheduleViewAssembler,
  ) {}

  async execute(command: PatchScheduleCommand): Promise<ScheduleView> {
    const fields = parseScheduleInput(PatchScheduleInputSchema, command.input, '');
    try {
      // Read, decide and rewrite must not interleave with another write of this process.
      return await this.writer.exclusive(() => this.patch(fields));
    } catch (error) {
      if (error instanceof ScheduleError) {
        this.logger.log({
          event: 'schedule.refused-change',
          scheduleId: fields.scheduleId,
          action: fields.request.action,
          correlationId: fields.correlationId,
          reason: error.reason,
        });
      }
      throw error;
    }
  }

  private async patch(fields: PatchScheduleFields): Promise<ScheduleView> {
    const { scheduleId } = fields;
    const now = new Date();
    const file = await this.store.read(scheduleId);
    if (file === null) throw new ScheduleNotFoundError(scheduleId);
    if (file.status === 'deleted') throw new ScheduleNotEditableError(scheduleId);

    const slots = await this.store.summarizeSlots(scheduleId, now);
    const change = changeSchedule({ file, action: await this.actionOf(file, fields.request, now), usedBriefIds: slots.usedBriefIds, now });
    if (change.kind === 'unchanged') return this.assembler.viewOf({ file, slots, detail: 'detail', now });

    const next = ScheduleFileSchema.parse(change.file);
    await this.writer.rewrite(next);
    this.logger.log({
      event: change.event,
      scheduleId,
      recipeRef: next.recipeRef,
      recurrenceKind: next.recurrence.kind,
      briefs: next.briefs.length,
      correlationId: fields.correlationId,
    });
    return this.assembler.viewOf({ file: next, slots, detail: 'detail', now });
  }

  /** `add-briefs` gets server-assigned ids, after the recipe checks of creation step 3. */
  private async actionOf(file: ScheduleFile, request: PatchScheduleRequest, now: Date): Promise<ScheduleAction> {
    if (request.action !== 'add-briefs') return request;
    await this.recipes.runnableVersion(file.recipeRef, request.briefs);
    return { action: 'add-briefs', briefs: toScheduleBriefs(request.briefs, now) };
  }
}
