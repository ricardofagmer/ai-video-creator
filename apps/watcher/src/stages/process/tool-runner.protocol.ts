import { z } from 'zod';

/**
 * Wire contract between the stage executors and the tool runner child (`tool-runner.main.ts`).
 * The request travels on stdin; the child prints exactly one result line prefixed with
 * `RESULT_MARKER` on stdout. Paths are absolute and chosen by the executor; the runner never
 * picks a destination on its own.
 */
export const RESULT_MARKER = '@@tool-runner-result@@';

const absolutePath = z.string().min(1).max(4096).startsWith('/');
const seconds = z.number().nonnegative().max(36_000);
/** An unprivileged loopback port (SPEC 0008 section 17.5). */
const studioPort = z.number().int().min(1024).max(65535);

const toolPaths = z.object({ ffmpegPath: z.string().min(1).max(4096), ffprobePath: z.string().min(1).max(4096) }).strict();

const wordTiming = z.object({ text: z.string().max(200), startS: seconds, endS: seconds }).strict();

export const MediaReviewRequestSchema = z
  .object({
    command: z.literal('media-review'),
    tools: toolPaths,
    input: absolutePath,
    container: z.enum(['mp4', 'mov']),
    videoCodec: z.string().regex(/^[a-z0-9_]{1,32}$/),
    audioCodec: z.string().regex(/^[a-z0-9_]{1,32}$/),
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    fps: z.number().gt(0).max(240),
    minDurationS: seconds,
    maxDurationS: seconds,
    loudnessTargetLufs: z.number().min(-30).max(-8),
    loudnessToleranceLu: z.number().gt(0).max(6),
    truePeakCeilingDbfs: z.number().min(-20).max(0),
    maxBlackRunS: z.number().min(0.1).max(60),
  })
  .strict();

export const MusicBedRequestSchema = z
  .object({
    command: z.literal('music-bed'),
    tools: toolPaths,
    input: absolutePath,
    output: absolutePath,
    music: absolutePath,
    loudnessTargetLufs: z.number().min(-30).max(-8),
    truePeakTargetDb: z.number().min(-9).max(-1),
  })
  .strict();

export const FadesRequestSchema = z
  .object({ command: z.literal('fades'), tools: toolPaths, input: absolutePath, output: absolutePath })
  .strict();

export const CaptionBurnRequestSchema = z
  .object({
    command: z.literal('caption-burn'),
    tools: toolPaths,
    input: absolutePath,
    output: absolutePath,
    srt: absolutePath,
    verticalAnchor: z.number().min(0).max(1),
  })
  .strict();

const RenderSceneRequestSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(['hook', 'problem', 'rubric', 'overview', 'step', 'evidence', 'result', 'analysis', 'verdict', 'cta']),
    startS: seconds,
    endS: seconds,
    onScreenText: z.string().max(200),
    /** Relative to `serveRoot`; served read-only on 127.0.0.1 to the renderer. */
    asset: z.object({ path: z.string().min(1).max(512), kind: z.enum(['image', 'video']) }).strict().nullable(),
  })
  .strict();
export type RenderSceneRequest = z.infer<typeof RenderSceneRequestSchema>;

const RenderRequestSchema = z
  .object({
    command: z.literal('render'),
    serveRoot: absolutePath,
    /** `@studio/shared/ace` `RenderTemplateIdSchema`: the 9:16 templates plus the 16:9 tour. */
    template: z.enum(['TOOL_DEMO', 'AI_BATTLE', 'AUTOMATION_BLUEPRINT', 'PRODUCT_TOUR_16X9']),
    title: z.string().max(200),
    durationS: z.number().positive().max(36_000),
    audioPath: z.string().min(1).max(512),
    scenes: z.array(RenderSceneRequestSchema).min(1).max(100),
    captions: z.array(wordTiming).max(20_000),
    disclosure: z.string().max(200),
    output: absolutePath,
    thumbnail: absolutePath,
  })
  .strict();
export type RenderRequest = z.infer<typeof RenderRequestSchema>;

export const SlateRenderRequestSchema = z
  .object({
    command: z.literal('slate-render'),
    tools: toolPaths,
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    fps: z.number().gt(0).max(240),
    durationS: z.number().positive().max(36_000),
    audio: absolutePath,
    output: absolutePath,
  })
  .strict();

export const TestCaptureRequestSchema = z
  .object({
    command: z.literal('test-capture'),
    tools: toolPaths,
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    durationS: z.number().positive().max(60),
    output: absolutePath,
  })
  .strict();

export const LiveCaptureRequestSchema = z
  .object({
    command: z.literal('live-capture'),
    url: z.string().url().max(2048).startsWith('https://'),
    durationS: z.number().positive().max(60),
    viewport: z.enum(['desktop', 'vertical']),
    output: absolutePath,
  })
  .strict();

export const PageTextRequestSchema = z
  .object({
    command: z.literal('page-text'),
    url: z.string().url().max(2048).startsWith('https://'),
    maxChars: z.number().int().min(100).max(200_000),
  })
  .strict();

export const NarrationAssembleRequestSchema = z
  .object({
    command: z.literal('narration-assemble'),
    tools: toolPaths,
    clips: z
      .array(z.object({ sceneId: z.string().min(1).max(64), path: absolutePath, text: z.string().max(10_000) }).strict())
      .min(1)
      .max(100),
    output: absolutePath,
  })
  .strict();

const HyperframesVariableValueSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()]);

/** SPEC 0008 section 4.4: one sandboxed HyperFrames render of a staged template copy. */
export const HyperframesRenderRequestSchema = z
  .object({
    command: z.literal('hyperframes-render'),
    tools: toolPaths,
    /** The private staged copy, never the store or the repository. */
    templateDir: absolutePath,
    variables: z
      .record(z.string().regex(/^[a-z][A-Za-z0-9]{0,39}$/), HyperframesVariableValueSchema)
      .refine((value) => Object.keys(value).length <= 32),
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(7680),
    fps: z.number().int().min(1).max(120),
    /** The narration length; the result is cut to it. */
    durationS: z.number().positive().max(3600),
    audio: absolutePath,
    output: absolutePath,
    scratchDir: absolutePath,
    runtime: z
      .object({
        binPath: absolutePath,
        browserPath: absolutePath,
        configDir: absolutePath,
        cacheDir: absolutePath,
        homeDir: absolutePath,
        sandboxProfilePath: absolutePath,
        ownerConfigDir: absolutePath,
        // SPEC 0008 section 17.5: sandbox parameters, each a real path resolved by the parent.
        ownerHomeDir: absolutePath,
        studioRoot: absolutePath,
        dataHomeRoot: absolutePath,
        hyperframesRoot: absolutePath,
        chromeDir: absolutePath,
        ffmpegBin: absolutePath,
        ffprobeBin: absolutePath,
        apiPort: studioPort,
        webPort: studioPort,
      })
      .strict(),
  })
  .strict();
export type HyperframesRenderRequest = z.infer<typeof HyperframesRenderRequestSchema>;

export const ToolRunnerRequestSchema = z.discriminatedUnion('command', [
  MediaReviewRequestSchema,
  MusicBedRequestSchema,
  FadesRequestSchema,
  CaptionBurnRequestSchema,
  RenderRequestSchema,
  SlateRenderRequestSchema,
  TestCaptureRequestSchema,
  LiveCaptureRequestSchema,
  PageTextRequestSchema,
  NarrationAssembleRequestSchema,
  HyperframesRenderRequestSchema,
]);
export type ToolRunnerRequest = z.infer<typeof ToolRunnerRequestSchema>;

/** C9 `media-review` result as the toolbox returns it (`packages/toolbox/src/commands/media/README.md`). */
export const MediaReviewResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(z.object({ id: z.string(), passed: z.boolean(), expected: z.string(), actual: z.string() })).max(50),
  measured: z.object({
    containerNames: z.array(z.string()),
    durationS: z.number().nonnegative(),
    video: z.object({ codec: z.string(), width: z.number(), height: z.number(), fps: z.number() }).nullable(),
    audio: z.object({ codec: z.string(), sampleRate: z.number() }).nullable(),
    integratedLufs: z.number().nullable(),
    truePeakDbfs: z.number().nullable(),
    blackRuns: z.array(z.object({ startS: z.number(), endS: z.number(), durationS: z.number() })).max(1000),
  }),
});
export type MediaReviewResult = z.infer<typeof MediaReviewResultSchema>;

export const MediaWriteResultSchema = z.object({ durationS: z.number().nonnegative() });
export const RenderResultSchema = z.object({ durationS: z.number().nonnegative(), renderSeconds: z.number().nonnegative() });
export const PageTextResultSchema = z.object({ title: z.string().max(500), text: z.string(), truncated: z.boolean() });
export const NarrationAssembleResultSchema = z.object({
  durationS: z.number().positive(),
  sceneTimings: z.array(z.object({ sceneId: z.string(), startS: z.number(), endS: z.number() })),
  words: z.array(wordTiming),
});
export type NarrationAssembleResult = z.infer<typeof NarrationAssembleResultSchema>;

/** Failure classes the runner reports; the message never carries stderr or provider bodies. */
const RunnerErrorKindSchema = z.enum(['input', 'tool', 'provider', 'blocked', 'internal']);
export type RunnerErrorKind = z.infer<typeof RunnerErrorKindSchema>;

export const ToolRunnerReplySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }).strict(),
  z.object({ ok: z.literal(false), error: z.object({ kind: RunnerErrorKindSchema, message: z.string().max(500) }).strict() }).strict(),
]);
export type ToolRunnerReply = z.infer<typeof ToolRunnerReplySchema>;
