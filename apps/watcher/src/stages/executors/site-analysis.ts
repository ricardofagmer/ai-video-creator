import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isReadableSourceUrl } from '@ace/toolbox/dist/providers/media/capture-url';
import { buildAnalystPacket, mockSiteAnalysis } from '@studio/core/agents';
import { EgressLog } from '@studio/core/providers';
import { ANALYST_ROLE, SiteAnalysisArtifactSchema, SiteAnalysisSchema } from '@studio/shared/agents';
import type { StageExecutionContext, StageFailure, StagePlanningContext } from '@studio/shared/ports';
import { researchStageParams } from '@studio/shared/recipes';
import { type DeclaredOutput, type ModelUse } from '@studio/shared/run-format';
import { callAgent } from '../agents/agent-call';
import { buildPacket, coordinatesOf } from '../agents/packet-sources';
import { PAGE_SCREENSHOT_MAX_BYTES, PAGE_SCREENSHOT_MAX_WIDTH_PX, PageScreenshotResultSchema } from '../process/tool-runner.protocol';
import { withScratchDir } from '../shared/scratch-dir';
import { type ResearchArtifact } from '../shared/stage-artifacts';
import { type StageDependencies } from '../shared/stage-dependencies';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';
import { placeholderScreenshotJpeg } from './site-screenshot.placeholder';

const SITE_SCREENSHOT_OUTPUT = 'site-screenshot';
const SITE_ANALYSIS_OUTPUT = 'site-analysis';
const SCREENSHOT_FILE = 'site-screenshot.jpg';
// Every JPEG starts with the SOI marker and the first segment marker.
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/** Why the research stage does or does not analyse the site, decided from the brief and the params. */
export type SiteAnalysisPlan = 'analyze' | 'no-source' | 'switched-off' | 'not-https';

export function siteAnalysisPlanOf(context: StagePlanningContext): SiteAnalysisPlan {
  const sourceUrl = context.brief.sourceUrl;
  if (sourceUrl === undefined) return 'no-source';
  if (!researchStageParams(context.params).siteAnalysis) return 'switched-off';
  return isReadableSourceUrl(sourceUrl) ? 'analyze' : 'not-https';
}

/** Optional: a failed screenshot or analyst call leaves them absent and the stage still delivers. */
export function siteAnalysisOutputs(context: StagePlanningContext): DeclaredOutput[] {
  return [
    { ...stageOutput(context.stage, SITE_SCREENSHOT_OUTPUT, SCREENSHOT_FILE, 'image/jpeg'), optional: true },
    { ...stageOutput(context.stage, SITE_ANALYSIS_OUTPUT, 'site-analysis.json', 'application/json'), optional: true },
  ];
}

/**
 * Analysis needs both outputs in this attempt's stage brief: a `retry-with-params` patch can turn
 * the param on after the brief was rendered, and writing an undeclared output is refused.
 */
export function analysisRunsNow(context: StageExecutionContext): boolean {
  const declared = new Set(context.stageBrief.declaredOutputs.map((output) => output.name));
  return siteAnalysisPlanOf(context) === 'analyze' && declared.has(SITE_SCREENSHOT_OUTPUT) && declared.has(SITE_ANALYSIS_OUTPUT);
}

export function skippedAnalysisNote(plan: SiteAnalysisPlan): string {
  if (plan === 'switched-off') return stageTexts.siteAnalysisSwitchedOff;
  if (plan === 'not-https') return stageTexts.siteAnalysisNotHttps;
  return '';
}

/** Mock mode: the placeholder JPEG and the labelled stand-in analysis, no connection. */
export async function writeMockSiteAnalysis(context: StageExecutionContext, outputs: StageOutputSink, sourceUrl: string): Promise<string> {
  await outputs.writeBytes(SITE_SCREENSHOT_OUTPUT, placeholderScreenshotJpeg());
  await outputs.writeJson(SITE_ANALYSIS_OUTPUT, SiteAnalysisArtifactSchema, {
    format: 1,
    mode: 'mock',
    sourceUrl,
    screenshot: true,
    analysis: mockSiteAnalysis(context.brief),
  });
  return stageTexts.siteAnalysisMock;
}

export type SiteAnalysisOutcome =
  | { status: 'done'; summary: string; models: ModelUse[] }
  | { status: 'failed'; failure: StageFailure; models: ModelUse[] };

interface LiveAnalysisRequest {
  context: StageExecutionContext;
  outputs: StageOutputSink;
  sourceUrl: string;
  page: ResearchArtifact;
}

function isUsableJpeg(bytes: Buffer): boolean {
  return bytes.length > 0 && bytes.length <= PAGE_SCREENSHOT_MAX_BYTES && bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE);
}

/**
 * Live mode: one screenshot, then one analyst call. The screenshot is written to its declared
 * output path before the call, where SiteScreenshotTool reads it while research is in progress
 * (spec Amendment 2). Only a refused credential fails the stage; every other failure is a warning
 * and leaves `site-analysis.json` absent.
 */
export async function analyzeSiteLive(dependencies: StageDependencies, request: LiveAnalysisRequest): Promise<SiteAnalysisOutcome> {
  const { context, outputs, sourceUrl, page } = request;
  const screenshotAvailable = await captureScreenshot(dependencies, request);
  const built = buildPacket(context, ANALYST_ROLE, () =>
    buildAnalystPacket({
      coordinates: coordinatesOf(context),
      brief: context.brief,
      sourceUrl,
      pageTitle: page.title,
      pageText: page.text,
      pageTextTruncated: page.truncated,
      screenshotAvailable,
    }),
  );
  const models: ModelUse[] = [];
  if (built.status === 'invalid') return { status: 'done', summary: stageTexts.siteAnalysisUnavailable('pacote inválido'), models };
  context.report({ kind: 'text', text: 'Analisando o site com IA.' });
  const call = await callAgent(dependencies.agents, { context, role: ANALYST_ROLE, packet: built.packet, models });
  if (call.status === 'failed') {
    if (call.failure.class === 'authentication') return { status: 'failed', failure: call.failure, models };
    return { status: 'done', summary: stageTexts.siteAnalysisUnavailable(call.cause), models };
  }
  const analysis = SiteAnalysisSchema.safeParse(call.output);
  if (!analysis.success) return { status: 'done', summary: stageTexts.siteAnalysisUnavailable('resposta fora do contrato'), models };
  await outputs.writeJson(SITE_ANALYSIS_OUTPUT, SiteAnalysisArtifactSchema, {
    format: 1,
    mode: dependencies.providerModes.isLive('claude') ? 'live' : 'mock',
    sourceUrl,
    screenshot: screenshotAvailable,
    analysis: analysis.data,
  });
  return { status: 'done', summary: stageTexts.siteAnalysisWritten(screenshotAvailable), models };
}

/** True when the screenshot reached its declared output path; any runner failure only loses the image. */
async function captureScreenshot(dependencies: StageDependencies, request: LiveAnalysisRequest): Promise<boolean> {
  const { context, outputs, sourceUrl } = request;
  const egress = await EgressLog.open(context.runDir);
  await egress.record({
    provider: 'capture',
    what: 'page-fetch',
    stepKey: context.stepKey,
    sessionId: null,
    at: dependencies.clock.now(),
    measure: { unit: 'pages', amount: 1 },
  });
  context.report({ kind: 'tool', text: `Capturando a tela da página ${new URL(sourceUrl).hostname}.` });
  const written = await withScratchDir(dependencies.settings, async (directory) => {
    const output = join(directory, SCREENSHOT_FILE);
    const shot = await dependencies.runner.run(
      { command: 'page-screenshot', url: sourceUrl, maxWidthPx: PAGE_SCREENSHOT_MAX_WIDTH_PX, maxBytes: PAGE_SCREENSHOT_MAX_BYTES, output },
      PageScreenshotResultSchema,
      // No inputs: the scratch root alone keeps the read side confined.
      { signal: context.signal, timeoutMs: commandTimeoutMs(context), readRoots: [] },
    );
    if (shot.status === 'failed') return false;
    const bytes = await readFile(output);
    if (!isUsableJpeg(bytes)) return false;
    await outputs.writeBytes(SITE_SCREENSHOT_OUTPUT, bytes);
    return true;
  });
  if (!written) context.report({ kind: 'text', text: stageTexts.siteScreenshotUnavailable });
  return written;
}
