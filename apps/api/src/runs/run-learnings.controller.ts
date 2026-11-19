import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SaveLearningFromRunCommand } from '@studio/core/learnings';
import {
  RunParamsSchema,
  SaveLearningRequestSchema,
  apiRouteSegments,
  type LearningNoteView,
  type SaveLearningRequest,
} from '@studio/shared/api';
import { type Response } from 'express';
import { type z } from 'zod';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { type Principal } from '../platform/request-context';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { SearchIndexScheduler } from '../search/search-index.scheduler';

type RunParams = z.output<typeof RunParamsSchema>;

/**
 * Learnings write-back (SPEC 0003 section 5.5, criterion 36, R2-AC-22). Core checks the run status
 * (409 `learning-run-not-reviewed`), that the ref is in the run's manifest (object-level check,
 * 422 `learning-ref-not-used`), biometric refusal, the secret scan and the per-version limit. The
 * author comes from the session and the source run from the path. The note's text is untrusted
 * and is never logged; the version is re-indexed after the response (R2-AC-11).
 */
@Controller(apiRouteSegments.runs)
export class RunLearningsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly searchIndex: SearchIndexScheduler,
  ) {}

  @Post(`:runId/${apiRouteSegments.learnings}`)
  @HttpCode(201)
  async save(
    @Param(new ZodValidationPipe(RunParamsSchema)) params: RunParams,
    @Body(new ZodValidationPipe(SaveLearningRequestSchema)) body: SaveLearningRequest,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LearningNoteView> {
    const result = await this.commandBus.execute(
      new SaveLearningFromRunCommand({ runId: params.runId, ref: body.ref, text: body.text, createdBy: principal.subject }),
    );
    this.searchIndex.afterResponse(response, [result.reindexRef]);
    return result.note;
  }
}
