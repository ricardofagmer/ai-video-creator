import { z } from 'zod';
import { IsoDateTimeSchema, RelativePathSchema, RunIdSchema } from '../common/ids';
import { AssetIdSchema, AssetRefSchema } from '../catalog/asset-kind';
import { BriefSchema } from '../recipes/brief';
import { RecipePinSchema, RecipeRefSchema } from '../recipes/recipe';
import { ApprovalFileSchema, GateDecisionSchema } from '../run-format/approval';
import { RunEventSchema } from '../run-format/events';
import { NowFileSchema } from '../run-format/now';
import { metricsBounds } from '../metrics/constants';
import { RunCreatedBySchema, RunFileSchema, TotalsSchema } from '../run-format/run-file';
import { RunScheduleLinkSchema } from '../run-format/schedule-link';
import { GateIdSchema, RunStatusSchema, StageIdSchema, StepNameSchema } from '../run-format/vocabulary';
import { PageLimitQuerySchema, pageOf, queryInteger, queryList } from './common';

export const RunParamsSchema = z.object({ runId: RunIdSchema }).strict();

/** `POST /runs`: a `draft` run.json from a recipe version and a brief (ADR 0003 "Who writes what"). */
export const CreateRunRequestSchema = z
  .object({
    recipeRef: RecipeRefSchema,
    brief: BriefSchema,
    references: z.array(AssetRefSchema).max(50).optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

/** `POST /runs` (201) and `POST /runs/:runId/start` (200, `draft` -> `pending`). */
export const RunDraftResponseSchema = z
  .object({
    run: RunFileSchema,
    /** `stale`: run.json is written but its index row is not; the next resync repairs it. */
    index: z.enum(['synced', 'stale']),
  })
  .strict();
export type RunDraftResponse = z.infer<typeof RunDraftResponseSchema>;

/**
 * Rev 4 (section 13.2, A22): the stage and step a listed run is at, copied from its `now.json` at
 * read time. Unrelated to the pagination `cursor` of `ListRunsQuery`.
 */
export const RunCursorViewSchema = z
  .object({
    stageId: StageIdSchema,
    step: StepNameSchema,
  })
  .strict();
export type RunCursorView = z.infer<typeof RunCursorViewSchema>;

/** One row of the run index (ADR 0003 decision 3); `status` is the recorded one. */
export const RunIndexEntryViewSchema = z
  .object({
    runId: RunIdSchema,
    title: z.string().min(1).max(200),
    status: RunStatusSchema,
    statusSince: IsoDateTimeSchema,
    /** Rev 5 (SPEC 0006): `watcher` for a run created from a schedule slot. */
    createdBy: RunCreatedBySchema,
    recipe: RecipePinSchema,
    costUsd: z.number().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    totals: TotalsSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    indexedAt: IsoDateTimeSchema,
    /**
     * Rev 4 (A22): read from `now.json` only for a recorded status of `running`, `waiting`,
     * `paused` or `interrupted`; `null` for every other status and when `now.json` is absent,
     * unreadable or names another run. At most one `now.json` read per listed row.
     */
    cursor: RunCursorViewSchema.nullable(),
    /** Rev 5 (SPEC 0006 section 4.4): copied from `run.json.schedule`; absent on every other run. */
    schedule: RunScheduleLinkSchema.optional(),
    /** Rev 5: recorded publications of the run (0 to 5); absent from a rev 4 producer. */
    publicationCount: z.number().int().min(0).max(metricsBounds.maxPublicationsPerRun).optional(),
  })
  .strict();
export type RunIndexEntryView = z.infer<typeof RunIndexEntryViewSchema>;

export const RunIndexPageSchema = pageOf(RunIndexEntryViewSchema);
export type RunIndexPageView = z.infer<typeof RunIndexPageSchema>;

/** `GET /runs` query: newest first. */
export const ListRunsQuerySchema = z
  .object({
    statuses: queryList(RunStatusSchema, RunStatusSchema.options.length).optional(),
    limit: PageLimitQuerySchema.optional(),
    cursor: RunIdSchema.optional(),
  })
  .strict();
export type ListRunsQuery = z.input<typeof ListRunsQuerySchema>;

/**
 * Rev 4 (section 13.5, A26): how `GET /runs/:runId/artifact` serves this run's media, computed by
 * the api with the rule core's `BiometricRunGuard` uses for promote, over the `run.json` bindings
 * and references plus the `manifest.json` assets and references when it is present.
 * - `withheld`: a considered ref's sensitivity lookup failed, or `manifest.json` is present but
 *   unreadable or names another run. Fail closed; takes precedence. No media is served.
 * - `playable-biometric`: otherwise, when any considered ref is `biometric`. `final.mp4` is the only
 *   media artifact served.
 * - `playable`: otherwise. Every allowlisted artifact is served.
 * JSON and text artifacts are served for every value.
 */
export const RunArtifactAccessSchema = z.enum(['playable', 'playable-biometric', 'withheld']);
export type RunArtifactAccess = z.infer<typeof RunArtifactAccessSchema>;

/**
 * `GET /runs/:runId`: live state read from the run files (files win over the index). The web
 * polls it (A17). `displayedStatus` shows a recorded `running` with a dead watcher as
 * `interrupted` (PRD 7.2). `watcher` describes the owner of this run from its `watcher.pid`; the
 * daemon-wide state is `GET /watcher`.
 */
export const RunStateResponseSchema = z
  .object({
    run: RunFileSchema,
    displayedStatus: RunStatusSchema,
    watcher: z.enum(['absent', 'alive', 'dead']),
    now: NowFileSchema.nullable(),
    approval: ApprovalFileSchema.nullable(),
    /**
     * Rev 4 (A21): month-to-date spend in USD for the calendar month of the server clock, from core
     * `CostLedgerService.monthToDateUsd`. `null` when core raises `MonthToDateUnavailableError`,
     * never 0. Display data only; the cost ceiling is still enforced by the watcher at `preflight`.
     */
    monthSpendUsd: z.number().nonnegative().nullable(),
    /** Rev 4: see `RunArtifactAccessSchema`. */
    artifactAccess: RunArtifactAccessSchema,
    /** Rev 5 (SPEC 0006 section 4.4): recorded publications of the run (0 to 5). */
    publicationCount: z.number().int().min(0).max(metricsBounds.maxPublicationsPerRun).optional(),
  })
  .strict();
export type RunStateResponse = z.infer<typeof RunStateResponseSchema>;

/** `GET /runs/:runId/events?fromByte=N`: complete `events.jsonl` lines from a byte offset. */
export const RunEventsQuerySchema = z
  .object({
    fromByte: queryInteger(0, Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
export type RunEventsQuery = z.input<typeof RunEventsQuerySchema>;

export const RunEventsResponseSchema = z
  .object({
    entries: z.array(RunEventSchema),
    /** Pass as `fromByte` on the next poll. */
    nextByte: z.number().int().nonnegative(),
    pendingTailBytes: z.number().int().nonnegative(),
  })
  .strict();
export type RunEventsResponse = z.infer<typeof RunEventsResponseSchema>;

/**
 * Run-relative artifacts the api serves with `GET /runs/:runId/artifact?path=<relative path>`:
 * these files, or anything below these folders, and only inside the run folder (symlinks that
 * leave it are refused). State files are served by `GET /runs/:runId` and the events route.
 * `Range: bytes=start-end` is honoured (206) so the web can seek `final.mp4`.
 */
export const runArtifactFiles: readonly string[] = ['final.mp4', 'manifest.json', 'cost.json', 'report.md', 'plan.md', 'egress.jsonl'];
export const runArtifactFolders: readonly string[] = ['qa', 'stages', 'archive', 'checks', 'sessions'];

export const RunArtifactQuerySchema = z.object({ path: RelativePathSchema }).strict();
export type RunArtifactQuery = z.infer<typeof RunArtifactQuerySchema>;

/**
 * `POST /runs/:runId/control`: a `control.json` request (ADR 0003, A6). `resume` may carry the
 * owner's corrected `brief`; the run keeps its own `format` and `language` whatever the body says.
 */
export const RunControlRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pause') }).strict(),
  z.object({ kind: z.literal('stop') }).strict(),
  z.object({ kind: z.literal('resume'), brief: BriefSchema.optional() }).strict(),
]);
export type RunControlRequest = z.infer<typeof RunControlRequestSchema>;

export const RunControlResponseSchema = z
  .object({ runId: RunIdSchema, requested: z.enum(['pause', 'stop', 'resume']) })
  .strict();
export type RunControlResponse = z.infer<typeof RunControlResponseSchema>;

/**
 * Fields the api sets from the session and the server clock, never from the request body:
 * `decidedBy`, `decidedAt` and `correlationId` (from `x-request-id`).
 */
const serverDecisionFields: { decidedBy: true; decidedAt: true; correlationId: true } = {
  decidedBy: true,
  decidedAt: true,
  correlationId: true,
};

const [planDecisionSchema, recipeGateDecisionSchema, finalDecisionSchema] = GateDecisionSchema.options;

/** `POST /runs/:runId/gate-decisions`: answers the plan gate or a recipe gate while the run waits. */
export const GateDecisionRequestSchema = z.discriminatedUnion('kind', [
  planDecisionSchema.omit(serverDecisionFields),
  recipeGateDecisionSchema.omit(serverDecisionFields),
]);
export type GateDecisionRequest = z.infer<typeof GateDecisionRequestSchema>;

export const GateDecisionResponseSchema = z.object({ runId: RunIdSchema, gate: GateIdSchema }).strict();
export type GateDecisionResponse = z.infer<typeof GateDecisionResponseSchema>;

/**
 * `POST /runs/:runId/review`: the final review (D14: outcome, 1-5 rating, notes, checklist).
 * Accepted only at `review` with no live watcher; an approval with a required checklist item
 * unchecked answers 422 `required-checklist-unchecked`.
 */
export const ReviewDecisionRequestSchema = finalDecisionSchema.omit({ ...serverDecisionFields, kind: true });
export type ReviewDecisionRequest = z.infer<typeof ReviewDecisionRequestSchema>;

export const ReviewDecisionResponseSchema = z
  .object({ runId: RunIdSchema, status: z.enum(['approved', 'rejected']) })
  .strict();
export type ReviewDecisionResponse = z.infer<typeof ReviewDecisionResponseSchema>;

/** `POST /runs/:runId/promote`: a run artifact becomes a new catalog version (PRD 5.3, A14). */
export const PromoteFromRunRequestSchema = z
  .object({
    artifactPath: RelativePathSchema,
    assetId: AssetIdSchema,
  })
  .strict();
export type PromoteFromRunRequest = z.infer<typeof PromoteFromRunRequestSchema>;

export const PromoteFromRunResponseSchema = z
  .object({ assetId: AssetIdSchema, version: z.number().int().min(1) })
  .strict();
export type PromoteFromRunResponse = z.infer<typeof PromoteFromRunResponseSchema>;

/** Catalog tag of a run's finished video saved for its preset (`POST /runs/:runId/save-video`). */
export const PRESET_VIDEO_TAG = 'preset-video';
/** The run-relative path the `package` stage writes the finished video to. */
export const RUN_FINAL_VIDEO_PATH = 'final.mp4';

/** `POST /runs/:runId/save-video` (no body): the run's `final.mp4` becomes a `reference` video asset. */
export const SaveRunVideoResponseSchema = z
  .object({ assetId: AssetIdSchema, version: z.number().int().min(1), recipeRef: RecipeRefSchema })
  .strict();
export type SaveRunVideoResponse = z.infer<typeof SaveRunVideoResponseSchema>;
