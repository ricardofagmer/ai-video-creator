import { type RecipeStage } from '@studio/shared/recipes';
import {
  stagePhase,
  type DeclaredOutput,
  type RunFile,
  type StageBrief,
  type StageInput,
  type StageLocation,
} from '@studio/shared/run-format';
import { learningsTexts } from '../owner-texts';
import { renderLearningsBody, type StageBriefLearnings } from './learnings-section';
import { STAGE_BRIEF_TEMPLATE_ID, stageBriefTemplates } from './stage-brief.templates';

/** StageBriefSchema caps `inputs` at 100 entries. */
const MAX_BRIEF_INPUTS = 100;

export interface StageBriefRenderInput {
  run: Readonly<RunFile>;
  location: StageLocation;
  recipeStage: RecipeStage | undefined;
  declaredOutputs: readonly DeclaredOutput[];
  renderedAt: Date;
  /** SPEC 0003 section 5.5: the capped notes at the run's cutoff (`StageBriefComposer`). */
  learnings: StageBriefLearnings;
}

/** Outputs of earlier delivered stages, pinned by the hash the `record` step wrote (ADR 0003 decision 4). */
function earlierOutputs(run: Readonly<RunFile>, stageNumber: number): StageInput[] {
  return run.stages
    .filter((stage) => stage.number < stageNumber && stage.outcome.status === 'delivered')
    .flatMap((stage) =>
      stage.outputs.map(
        (output): StageInput => ({
          name: output.name,
          fromStage: stage.stageId,
          path: output.path,
          contentHash: output.contentHash,
        }),
      ),
    )
    .slice(-MAX_BRIEF_INPUTS);
}

function bulletList(lines: readonly string[]): string {
  return lines.length === 0 ? '- nenhum' : lines.map((line) => `- ${line}`).join('\n');
}

function renderInstructions(input: StageBriefRenderInput, inputs: readonly StageInput[]): string {
  const { run, location, recipeStage, declaredOutputs } = input;
  const template = stageBriefTemplates[location.stageId];
  const brief = run.brief;
  const params = Object.entries(recipeStage?.params ?? {}).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return [
    `# ${template.title}`,
    '',
    `Execução ${run.runId}, etapa ${location.stageNumber} de ${run.stages.length} (${stagePhase[location.stageId]}).`,
    '',
    '## Objetivo',
    template.goal,
    '',
    '## Brief',
    bulletList([
      `Tema: ${brief.topic}`,
      `Formato: ${brief.format}, ${brief.language}, ${brief.targetDurationSec} s`,
      `Mensagens-chave: ${brief.keyMessages.length === 0 ? 'nenhuma' : brief.keyMessages.join('; ')}`,
    ]),
    '',
    `## ${learningsTexts.heading}`,
    ...renderLearningsBody(input.learnings),
    '',
    '## Parâmetros da receita',
    bulletList(params),
    '',
    '## Entradas',
    bulletList(inputs.map((stageInput) => `${stageInput.name} (${stageInput.fromStage}): ${stageInput.path}`)),
    '',
    '## Saídas esperadas',
    bulletList(declaredOutputs.map((output) => `${output.name}: ${output.path} (${output.mimeType}${output.optional === true ? ', opcional' : ''})`)),
    '',
    '## Verificações',
    bulletList(recipeStage?.checks ?? []),
    '',
  ].join('\n');
}

/**
 * The `brief` step (PRD 7.2 step 1): a deterministic render from the recipe, the run brief and the
 * outputs recorded so far. No model is called (topology section 2, SPEC 0002 K1). The learning
 * notes are data: `learnings` lists them and `instructions` quotes each one inside an `<untrusted>`
 * block under "## Aprendizados do catálogo", after "## Brief" (SPEC 0003 section 5.5).
 */
export function renderStageBrief(input: StageBriefRenderInput): StageBrief {
  const { run, location, recipeStage, declaredOutputs } = input;
  const inputs = earlierOutputs(run, location.stageNumber);
  return {
    runId: run.runId,
    stageNumber: location.stageNumber,
    stageId: location.stageId,
    phaseId: stagePhase[location.stageId],
    title: stageBriefTemplates[location.stageId].title,
    templateId: STAGE_BRIEF_TEMPLATE_ID,
    renderedAt: input.renderedAt.toISOString(),
    instructions: renderInstructions(input, inputs),
    bindings: run.recipe.definition.bindings.map((binding) => ({ slot: binding.slot, ref: binding.ref })),
    inputs,
    checks: [...(recipeStage?.checks ?? [])],
    declaredOutputs: [...declaredOutputs],
    learnings: input.learnings.map((entry) => ({ ...entry, notes: entry.notes.map((note) => ({ ...note })) })),
  };
}
