import { stat } from 'node:fs/promises';
import { DIRECTOR_ROLE, EVALUATOR_ROLE, PLANNER_ROLE, ReviewVerdictSchema, WRITER_ROLE } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { readEgressEntries, resolveInsideRun, writeRunMarkdown } from '@studio/shared/run-files';
import {
  MAX_EGRESS_ENTRIES,
  QaMetricsSchema,
  QaSummarySchema,
  ReviewSubjectSchema,
  RunManifestSchema,
  runFileNames,
  type QaReview,
  type QaSummary,
  type RunManifest,
} from '@studio/shared/run-format';
import { readStageInput } from './mock-artifacts';
import { MOCK_MODEL_ID } from './mock-sessions';
import { bytesWrite, jsonWrite, mockMediaBytes, zeroEstimate, type MockStageBehaviour, type MockStageTools } from './mock-stage-behaviour';

const MANIFEST_OUTPUTS_MAX = 500;

class EgressLogTooLongError extends Error {
  constructor(readonly entries: number) {
    super(`egress.jsonl holds ${entries} entries; manifest.json.egress accepts at most ${MAX_EGRESS_ENTRIES}`);
    this.name = 'EgressLogTooLongError';
  }
}

/**
 * `manifest.json.egress` is a copy of `egress.jsonl` (SPEC 0002 rev 3), so the list survives a
 * watcher crash. A missing file reads as empty. A longer log fails the stage rather than dropping
 * lines: an incomplete "what left the machine" list would make the report wrong.
 */
async function egressOf(context: StageExecutionContext): Promise<RunManifest['egress']> {
  const { entries } = await readEgressEntries(context.runDir);
  if (entries.length > MAX_EGRESS_ENTRIES) throw new EgressLogTooLongError(entries.length);
  return entries;
}

async function hashedOutputs(context: StageExecutionContext): Promise<RunManifest['outputs']> {
  const outputs: RunManifest['outputs'] = [];
  for (const input of context.stageBrief.inputs.slice(-MANIFEST_OUTPUTS_MAX)) {
    const info = await stat(resolveInsideRun(context.runDir, input.path));
    outputs.push({ name: input.name, path: input.path, contentHash: input.contentHash, sizeBytes: info.size });
  }
  return outputs;
}

async function manifestOf(context: StageExecutionContext, tools: MockStageTools): Promise<RunManifest> {
  const pinned = context.inputManifest.assets;
  const sensitivityOf = (ref: string): RunManifest['assets'][number]['sensitivity'] =>
    context.assets.find((asset) => asset.ref === ref)?.sensitivity ?? 'normal';
  return {
    format: 1,
    runId: context.runId,
    createdAt: tools.clock.now().toISOString(),
    recipe: context.recipePin,
    assets: pinned
      .filter((asset) => !asset.slot.startsWith('reference:'))
      .map((asset) => ({ slot: asset.slot, ref: asset.ref, kind: asset.kind, contentHash: asset.contentHash, sensitivity: sensitivityOf(asset.ref) })),
    references: pinned.filter((asset) => asset.slot.startsWith('reference:')).map((asset) => ({ ref: asset.ref, contentHash: asset.contentHash })),
    parameters: {
      brief: context.brief,
      stages: context.recipe.graph.stages.map((stage) => ({ stageId: stage.stageId, params: stage.params })),
    },
    models: [PLANNER_ROLE, WRITER_ROLE, DIRECTOR_ROLE, EVALUATOR_ROLE].map((role) => ({ role, modelId: MOCK_MODEL_ID })),
    egress: await egressOf(context),
    outputs: await hashedOutputs(context),
  };
}

async function reviewsOf(context: StageExecutionContext): Promise<QaReview[]> {
  const reviews: QaReview[] = [];
  for (const subject of ReviewSubjectSchema.options) {
    const name = `review-${subject}`;
    const input = context.stageBrief.inputs.find((candidate) => candidate.name === name);
    if (input === undefined) {
      reviews.push({ status: 'unavailable', subject, reason: 'Revisão desta parte não registrada nesta execução.' });
      continue;
    }
    const verdict = await readStageInput(context, name, ReviewVerdictSchema);
    reviews.push({ status: 'recorded', subject, overall: verdict.overall, verdictPath: input.path });
  }
  return reviews;
}

function egressLines(egress: RunManifest['egress']): string[] {
  if (egress.length === 0) return ['- Nada: nenhuma chamada externa foi registrada nesta execução.'];
  return egress.map((entry) => `- ${entry.provider}: ${entry.summary} (${entry.stepKey}).`);
}

function reportMarkdown(context: StageExecutionContext, manifest: RunManifest): string {
  return [
    `# Relatório — ${context.brief.topic}`,
    '',
    '## O que foi feito',
    `- Receita ${manifest.recipe.ref}; ${manifest.outputs.length} saída(s) registradas com hash.`,
    '',
    '## Decisões',
    '- Plano aprovado; nenhuma etapa desligada pelo plano.',
    '',
    '## O que saiu da máquina',
    ...egressLines(manifest.egress),
    '',
    '## O que ouvir com atenção',
    '- Execução simulada: a mídia é um marcador, não um vídeo real.',
    '',
    '## Avisos',
    '- Execução de teste do watcher (R1-04).',
    '',
  ].join('\n');
}

/** K5: final.mp4, manifest.json, cost.json, qa/summary.json and report.md before `review`. */
export const packageBehaviour: MockStageBehaviour = {
  stageId: 'package',
  provider: 'render',
  estimate: zeroEstimate,
  outputs: () => [
    { name: 'final-video', path: runFileNames.finalVideo, mimeType: 'video/mp4' },
    { name: 'manifest', path: runFileNames.manifest, mimeType: 'application/json' },
    { name: 'cost', path: runFileNames.cost, mimeType: 'application/json' },
    { name: 'qa-summary', path: runFileNames.qaSummary, mimeType: 'application/json' },
    { name: 'report', path: runFileNames.report, mimeType: 'text/markdown' },
  ],
  produce: async (context, tools) => {
    await tools.ledger.ensureCostFile(context.runDir, context.runId);
    const manifest = await manifestOf(context, tools);
    const summary: QaSummary = {
      runId: context.runId,
      createdAt: tools.clock.now().toISOString(),
      outcome: 'passed',
      metrics: await readStageInput(context, 'qa-metrics', QaMetricsSchema),
      // R1-14's package executor indexes the qa stage's check results here.
      checks: [],
      reviews: await reviewsOf(context),
      warnings: ['Execução simulada: nenhuma mídia real foi gerada.'],
    };
    return [
      bytesWrite('final-video', mockMediaBytes('final')),
      jsonWrite('manifest', RunManifestSchema, manifest),
      jsonWrite('qa-summary', QaSummarySchema, summary),
      { name: 'report', write: async () => writeRunMarkdown(context.runDir, 'report', reportMarkdown(context, manifest)) },
    ];
  },
  summary: 'Pacote simulado: vídeo, manifesto, custos, QA e relatório.',
};
