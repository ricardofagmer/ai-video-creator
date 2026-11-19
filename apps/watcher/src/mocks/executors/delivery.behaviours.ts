import { ReviewVerdictSchema, ScriptOutputSchema } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { QaMetricsSchema, reviewVerdictPath, runFileNames, type QaMetrics } from '@studio/shared/run-format';
import { reviewPacket } from './agent-packets';
import { MockMediaReviewSchema, readStageInput } from './mock-artifacts';
import { emitReviewVerdict, recordModelSession } from './mock-sessions';
import { jsonWrite, stageOutput, zeroEstimate, type MockStageBehaviour } from './mock-stage-behaviour';

const JSON_MIME = 'application/json';

/** Metrics a real ffprobe/ebur128 pass would measure, set to the recipe's own targets. */
async function mockQaMetrics(context: StageExecutionContext): Promise<QaMetrics> {
  const script = await readStageInput(context, 'script', ScriptOutputSchema);
  const { format } = context.recipe;
  return {
    container: 'mp4',
    videoCodec: 'h264',
    durationMs: Math.round(script.totalEstDurationSec * 1000),
    width: format.canvas.width,
    height: format.canvas.height,
    fps: format.fps,
    audio: {
      status: 'present',
      codec: 'aac',
      integratedLufs: format.loudness.integratedLufs,
      truePeakDbtp: format.loudness.truePeakDbtp - 0.5,
    },
    blackRuns: [],
    captionMaxDriftMs: 0,
  };
}

export const qaBehaviour: MockStageBehaviour = {
  stageId: 'qa',
  provider: 'render',
  estimate: zeroEstimate,
  outputs: (location) => [
    stageOutput(location, 'qa-metrics', 'metrics.json', JSON_MIME),
    { name: 'media-review', path: runFileNames.qaMediaReview, mimeType: JSON_MIME },
  ],
  produce: async (context) => [
    jsonWrite('qa-metrics', QaMetricsSchema, await mockQaMetrics(context)),
    jsonWrite('media-review', MockMediaReviewSchema, { status: 'passed', notes: ['Mídia simulada; métricas iguais às metas da receita.'] }),
  ],
  summary: 'QA simulado: formato, áudio e legendas dentro das metas da receita.',
  evidence: {
    container: 'mp4',
    codec: 'h264 / aac',
    resolution: 'igual à tela da receita',
    fps: 'igual à receita',
    duration: 'dentro da faixa da receita',
    loudness: 'igual à meta da receita',
    'true-peak': '0,5 dB abaixo do teto',
    'audio-present': 'áudio presente',
    'black-frames': 'nenhum trecho preto',
    'caption-timing': 'desvio máximo 0 ms',
  },
};

export const agentReviewBehaviour: MockStageBehaviour = {
  stageId: 'agent-review',
  provider: 'claude',
  estimate: zeroEstimate,
  outputs: () => [{ name: 'review-render', path: reviewVerdictPath('render'), mimeType: JSON_MIME }],
  produce: async (context, tools) => {
    const qaMetrics = await readStageInput(context, 'qa-metrics', QaMetricsSchema);
    const verdict = await tools.agents.run('evaluator', reviewPacket(context, 'render', qaMetrics), { signal: context.signal });
    await recordModelSession(context, tools, 'evaluator');
    await emitReviewVerdict(context, 'render', verdict);
    return [jsonWrite('review-render', ReviewVerdictSchema, verdict)];
  },
  summary: 'Revisão simulada do vídeo renderizado, nota geral 4.',
  evidence: { 'reviewer-score': 'nota geral 4' },
};
