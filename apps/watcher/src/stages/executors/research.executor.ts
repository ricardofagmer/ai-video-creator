import { EgressLog } from '@studio/core/providers';
import type { StageExecutionContext, StageExecutionResult, StagePlanningContext } from '@studio/shared/ports';
import { type DeclaredOutput, type StageEstimate } from '@studio/shared/run-format';
import { PageTextResultSchema } from '../process/tool-runner.protocol';
import { BaseStageExecutor, zeroEstimate } from '../shared/base-stage.executor';
import { ResearchArtifactSchema, type ResearchArtifact } from '../shared/stage-artifacts';
import { stageOutput, type StageOutputSink } from '../shared/stage-io';
import { commandTimeoutMs, needsPerson, reportedSuccess, stageFailed, toolFailure, type CheckEvidenceMap } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';

/** Visible text kept from the brief's page; long pages are cut, and the cut is recorded. */
const PAGE_TEXT_MAX_CHARS = 100_000;

/**
 * `research`: captures the brief's `sourceUrl` and keeps the page's visible text, the evidence the
 * `verify` stage matches claims against. Deterministic: no model reads the page here. Mock mode
 * builds a labelled stand-in text from the brief and opens no connection; live mode records the
 * page fetch in egress.jsonl first, then reads the page through Playwright in the tool runner,
 * held to the page's own https host.
 */
export class ResearchExecutor extends BaseStageExecutor {
  readonly stageId = 'research';
  protected readonly faultProvider = 'capture';

  async estimate(): Promise<StageEstimate> {
    return zeroEstimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return [stageOutput(context.stage, 'research', 'research.json', 'application/json')];
  }

  protected async checkEvidence(): Promise<CheckEvidenceMap> {
    return new Map();
  }

  protected async run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult> {
    const sourceUrl = context.brief.sourceUrl ?? null;
    if (sourceUrl === null) {
      await outputs.writeJson('research', ResearchArtifactSchema, { format: 1, mode: 'no-source', sourceUrl, title: '', text: '', truncated: false });
      return reportedSuccess(stageTexts.noSourceUrl);
    }
    if (!this.isLive('capture')) {
      await outputs.writeJson('research', ResearchArtifactSchema, mockResearch(context, sourceUrl));
      return reportedSuccess('Pesquisa simulada: texto montado a partir do brief, sem acessar a página.');
    }
    if (!sourceUrl.startsWith('https://')) {
      return stageFailed(needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, stageTexts.captureBlocked, stageTexts.captureBlockedWhatToDo));
    }

    const egress = await EgressLog.open(context.runDir);
    await egress.record({
      provider: 'capture',
      what: 'page-fetch',
      stepKey: context.stepKey,
      sessionId: null,
      at: this.dependencies.clock.now(),
      measure: { unit: 'pages', amount: 1 },
    });
    context.report({ kind: 'tool', text: `Lendo a página ${new URL(sourceUrl).hostname}.` });
    const page = await this.dependencies.runner.run(
      { command: 'page-text', url: sourceUrl, maxChars: PAGE_TEXT_MAX_CHARS },
      PageTextResultSchema,
      { signal: context.signal, timeoutMs: commandTimeoutMs(context) },
    );
    if (page.status === 'failed') return stageFailed(toolFailure(page, context));
    await outputs.writeJson('research', ResearchArtifactSchema, {
      format: 1,
      mode: 'live',
      sourceUrl,
      title: page.result.title,
      text: page.result.text,
      truncated: page.result.truncated,
    });
    return reportedSuccess(`Página lida: ${page.result.text.length} caracteres de texto visível.`);
  }
}

/** Mock page: says it is simulated and carries each key message, so mock claims find evidence. */
function mockResearch(context: StageExecutionContext, sourceUrl: string): ResearchArtifact {
  const lines = [
    `Texto simulado da página ${sourceUrl} (modo simulado, nenhuma conexão aberta).`,
    `Tema: ${context.brief.topic}.`,
    ...context.brief.keyMessages.map((message) => `${message}.`),
  ];
  return { format: 1, mode: 'mock', sourceUrl, title: `Simulado: ${context.brief.topic}`.slice(0, 500), text: lines.join(' '), truncated: false };
}
