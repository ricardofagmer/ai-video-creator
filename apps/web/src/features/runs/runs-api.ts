import {
  CreateRunRequestSchema,
  GateDecisionRequestSchema,
  GateDecisionResponseSchema,
  RunControlRequestSchema,
  RunControlResponseSchema,
  RunDraftResponseSchema,
  RunEventsResponseSchema,
  RunIndexPageSchema,
  RunStateResponseSchema,
  apiPaths,
  type CreateRunRequest,
  type GateDecisionRequest,
  type GateDecisionResponse,
  type RunControlRequest,
  type RunControlResponse,
  type RunDraftResponse,
  type RunEventsResponse,
  type RunIndexPageView,
  type RunStateResponse,
} from '@studio/shared/api';
import { type RunStatus } from '@studio/shared/run-format';
import { type z } from 'zod';
import { BFF_PREFIX, browserTransport, checkedBody, requestJson, type ApiTransport } from '@/lib/api';

/** `GET /runs` (C10 `ListRunsQuery`) with a typed status list. */
export interface RunListParams {
  statuses?: readonly RunStatus[];
  limit?: number;
  cursor?: string;
}

/**
 * The C10 runs calls (contract C10, API_CONTRACT_REVISION 2), built on the frozen `requestJson`
 * of `lib/api` as `client.ts` says R1-20 should. Every body is checked with its C10 schema before
 * it is sent and every response is parsed with its C10 schema. `decidedBy` and `decidedAt` are
 * not part of any request schema here: the api takes them from the session and its clock.
 */
export interface RunsApi {
  listRuns(params?: RunListParams): Promise<RunIndexPageView>;
  getRunState(runId: string, signal?: AbortSignal): Promise<RunStateResponse>;
  getRunEvents(runId: string, fromByte: number, signal?: AbortSignal): Promise<RunEventsResponse>;
  createRun(request: CreateRunRequest): Promise<RunDraftResponse>;
  startRun(runId: string): Promise<RunDraftResponse>;
  requestControl(runId: string, request: RunControlRequest): Promise<RunControlResponse>;
  recordGateDecision(runId: string, request: GateDecisionRequest): Promise<GateDecisionResponse>;
  /** A JSON run artifact (`manifest.json`, `cost.json`, `qa/summary.json`) parsed with its C3 schema. */
  readArtifactJson<Schema extends z.ZodTypeAny>(runId: string, relativePath: string, schema: Schema): Promise<z.output<Schema>>;
}

export function createRunsApi(transport: ApiTransport): RunsApi {
  return {
    listRuns: (params = {}) => requestJson(transport, { method: 'GET', path: apiPaths.runs(), query: { ...params } }, RunIndexPageSchema),
    getRunState: (runId, signal) => requestJson(transport, { method: 'GET', path: apiPaths.run(runId), signal }, RunStateResponseSchema),
    getRunEvents: (runId, fromByte, signal) =>
      requestJson(transport, { method: 'GET', path: apiPaths.runEvents(runId), query: { fromByte }, signal }, RunEventsResponseSchema),
    createRun: (request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.runs(), body: { kind: 'json', value: checkedBody(CreateRunRequestSchema, request) } },
        RunDraftResponseSchema,
      ),
    startRun: (runId) => requestJson(transport, { method: 'POST', path: apiPaths.runStart(runId) }, RunDraftResponseSchema),
    requestControl: (runId, request) =>
      requestJson(
        transport,
        { method: 'POST', path: apiPaths.runControl(runId), body: { kind: 'json', value: checkedBody(RunControlRequestSchema, request) } },
        RunControlResponseSchema,
      ),
    recordGateDecision: (runId, request) =>
      requestJson(
        transport,
        {
          method: 'POST',
          path: apiPaths.runGateDecisions(runId),
          body: { kind: 'json', value: checkedBody(GateDecisionRequestSchema, request) },
        },
        GateDecisionResponseSchema,
      ),
    readArtifactJson: (runId, relativePath, schema) =>
      requestJson(transport, { method: 'GET', path: apiPaths.runArtifact(runId, relativePath) }, schema),
  };
}

/** The runs client for client components (same-origin BFF). */
export const browserRunsApi: RunsApi = createRunsApi(browserTransport);

/**
 * Same-origin URL of a run artifact for `<video src>` and evidence links. It goes through the BFF
 * and its C10 allowlist like every other call; the api decides what may be served.
 */
export function runArtifactUrl(runId: string, relativePath: string): string {
  return `${BFF_PREFIX}${apiPaths.runArtifact(runId, relativePath)}`;
}
