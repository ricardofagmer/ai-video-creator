import {
  LearningNoteViewSchema,
  RetireLearningRequestSchema,
  SaveLearningRequestSchema,
  apiPaths,
  type LearningNoteView,
  type SaveLearningRequest,
} from '@studio/shared/api';
import { browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/**
 * The C10 rev 3 learning calls (SPEC 0003 section 5.5). `createdBy` and `sourceRunId` come from the
 * session and the path, never from the body. A note is retired only through the version it belongs
 * to; nothing is deleted.
 */
export interface LearningsApi {
  saveFromRun(runId: string, request: SaveLearningRequest): Promise<LearningNoteView>;
  retire(options: { assetId: string; version: number; noteId: string }): Promise<LearningNoteView>;
}

function createLearningsApi(transport: ApiTransport): LearningsApi {
  return {
    saveFromRun: (runId, request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.runLearnings(runId), body: { kind: 'json', value: checkedBody(SaveLearningRequestSchema, request) } },
        LearningNoteViewSchema,
      ),
    retire: (options) =>
      requestJson(
        transport,
        {
          method: 'PUT',
          path: apiPaths.assetLearningStatus(options),
          body: { kind: 'json', value: checkedBody(RetireLearningRequestSchema, { status: 'retired' }) },
        },
        LearningNoteViewSchema,
      ),
  };
}

/** The learnings client for client components (same-origin BFF). */
export const browserLearningsApi: LearningsApi = createLearningsApi(browserTransport);
