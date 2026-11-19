import { type PlanOutput } from '@studio/shared/agents';
import { type RunFile } from '@studio/shared/run-format';
import { renderLearningsBody, type StageBriefLearnings } from '../brief/learnings-section';
import { learningsTexts } from '../owner-texts';

function usd(value: number): string {
  return `US$ ${value.toFixed(2)}`;
}

/**
 * `plan.md`: the pt-BR export of the plan for people, never read back as state (RUN-FORMAT
 * section 9). Headings follow `planSections`; the C5 writer refuses a document missing one.
 * "## Aprendizados do catálogo" lists the learning notes of the `plan` stage brief, the same list
 * and the same `<untrusted>` delimiting, so the owner reads them before approving the plan (SPEC
 * 0003 section 5.5). `learnings` is null when that brief was rendered before R2.
 */
export function renderPlanMarkdown(run: Readonly<RunFile>, plan: PlanOutput, learnings: StageBriefLearnings | null): string {
  const stageLines = plan.phases.flatMap((phase) =>
    phase.stages.map(
      (stage) =>
        `- ${phase.id} / ${stage.stageId}: ${stage.enabled ? 'ligada' : 'desligada'}; verificações: ${
          stage.checks.length === 0 ? 'nenhuma' : stage.checks.join(', ')
        }; estimativa ${usd(stage.estimate.usd)}`,
    ),
  );
  const pins = [
    `- Receita: ${run.recipe.ref} (${run.recipe.contentHash.slice(0, 12)})`,
    ...run.recipe.definition.bindings.map((binding) => `- ${binding.slot}: ${binding.ref} (${binding.contentHash.slice(0, 12)})`),
  ];
  const risks = plan.risks.length === 0 ? ['- Nenhum risco apontado.'] : plan.risks.map((risk) => `- ${risk}`);
  const questions = plan.questionsForOwner.map((question) => `- Pergunta: ${question}`);
  return [
    `# Plano — ${run.title}`,
    '',
    '## Fases e etapas',
    ...stageLines,
    '',
    '## Versões fixadas',
    ...pins,
    '',
    `## ${learningsTexts.heading}`,
    ...(learnings === null ? [learningsTexts.notRecorded] : renderLearningsBody(learnings)),
    '',
    '## Estimativa de custo',
    `- Total estimado: ${usd(plan.totalEstimateUsd)}`,
    `- Teto por execução: ${usd(run.limits.costPerRunUsd)}; teto mensal: ${usd(run.limits.costPerMonthUsd)}`,
    '',
    '## Riscos',
    ...risks,
    ...questions,
    '',
  ].join('\n');
}
