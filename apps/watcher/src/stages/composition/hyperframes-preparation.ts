import { type ScriptOutput } from '@studio/shared/agents';
import { type TemplateDetails } from '@studio/shared/catalog';
import {
  HYPERFRAMES_SCENE_SLOTS,
  hyperframesTemplateIssues,
  parseFlatInputSchema,
  resolveTemplateVariables,
  type HyperframesRefusalReason,
  type HyperframesVariableValue,
  type StudioTemplateVariable,
} from '@studio/shared/hyperframes';

/*
 * The pre-start checks of SPEC 0008 section 5.2 that need no run output and no disk: the template
 * against the run (2 to 4) and the variable resolution of check 6 (section 5.3). Check 1, the
 * render runtime, is the render runtime gate of `@studio/hyperframes`.
 */

export type Checked<T> = { status: 'ok'; value: T } | { status: 'refused'; reason: HyperframesRefusalReason };

function refuse<T>(reason: HyperframesRefusalReason): Checked<T> {
  return { status: 'refused', reason };
}

/** Checks 2 to 4: flat template, the recipe's canvas and fps, the narration inside the range. */
export function templateFitsRun(
  details: TemplateDetails,
  run: { canvas: { width: number; height: number }; fps: number; narrationS: number },
): HyperframesRefusalReason | null {
  if (hyperframesTemplateIssues(details).length > 0) return 'template-not-flat';
  if (details.canvas.width !== run.canvas.width || details.canvas.height !== run.canvas.height || details.fps !== run.fps) {
    return 'canvas-mismatch';
  }
  if (run.narrationS < details.duration.minSec || run.narrationS > details.duration.maxSec) return 'duration-out-of-range';
  return null;
}

export interface VariableInputs {
  details: TemplateDetails;
  recipeValues: unknown;
  script: ScriptOutput;
  disclosure: string;
  narrationS: number;
  accent: string | null;
  /** On-screen text of each narrated scene with the second it starts, in order. */
  scenes: readonly SceneText[];
}

export interface SceneText {
  text: string;
  startS: number;
}

/**
 * The `sceneNText` / `sceneNStartS` pairs. A slot with no scene gets empty text and starts at the
 * end, so a template shows nothing for it; scenes past the last slot keep the last slot's text.
 */
function sceneVariables(scenes: readonly SceneText[], narrationS: number): Partial<Record<StudioTemplateVariable, HyperframesVariableValue>> {
  const variables: Record<string, HyperframesVariableValue> = {};
  for (let slot = 1; slot <= HYPERFRAMES_SCENE_SLOTS; slot += 1) {
    const scene = scenes[slot - 1];
    variables[`scene${slot}Text`] = scene?.text ?? '';
    variables[`scene${slot}StartS`] = scene?.startS ?? narrationS;
  }
  return variables;
}

/** Check 6 (section 5.3): recipe values first, then the studio vocabulary, then the template default. */
export function templateVariables(inputs: VariableInputs): Checked<Readonly<Record<string, HyperframesVariableValue>>> {
  const parsed = parseFlatInputSchema(inputs.details.inputSchema);
  if (parsed.status !== 'valid') return refuse('template-not-flat');
  const vocabulary: Partial<Record<StudioTemplateVariable, HyperframesVariableValue>> = {
    title: inputs.script.title,
    hook: inputs.script.hook,
    disclosure: inputs.disclosure,
    durationS: inputs.narrationS,
    ...sceneVariables(inputs.scenes, inputs.narrationS),
  };
  if (inputs.accent !== null) vocabulary.accent = inputs.accent;
  const resolution = resolveTemplateVariables({ schema: parsed.schema, recipeValues: inputs.recipeValues, vocabulary });
  return resolution.status === 'resolved' ? { status: 'ok', value: resolution.variables } : refuse(resolution.reason);
}
