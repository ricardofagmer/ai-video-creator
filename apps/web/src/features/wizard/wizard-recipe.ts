import { type RecipeDefinitionInput } from '@studio/shared/api';
import { type AssetKind } from '@studio/shared/catalog';
import { musicChoiceOf, withMusicChoice, type Binding, type MusicChoice, type Recipe } from '@studio/shared/recipes';
import { type StageId } from '@studio/shared/run-format';
import { type BindingOption } from '@/features/recipes/recipe-form-model';
import { slotSpecs, type SlotSpec } from '@/features/recipes/recipe-slots';
import { sameFormat, type ResolvedFormat } from './wizard-format';

/** The pins step 3 offers (guided-creation spec section 5): one voice, one template, optional brand kit and music. */
export const wizardSlotIds = ['voice', 'template', 'brand-kit', 'music'] as const;
export type WizardSlot = (typeof wizardSlotIds)[number];

/** The owner's step 3 answers; a missing slot keeps the base recipe's pin, '' leaves the slot empty. */
export type WizardChoices = Readonly<Partial<Record<WizardSlot, string>>>;

export interface WizardSlotSpec extends SlotSpec {
  slot: WizardSlot;
}

function isWizardSlotSpec(spec: SlotSpec): spec is WizardSlotSpec {
  return wizardSlotIds.some((slot) => slot === spec.slot);
}

const wizardSlotSpecs: readonly WizardSlotSpec[] = slotSpecs.filter(isWizardSlotSpec);

function enabledStagesOf(recipe: Pick<Recipe, 'graph'>): Set<StageId> {
  return new Set(recipe.graph.stages.filter((stage) => stage.enabled).map((stage) => stage.stageId));
}

/** The step 3 slots this recipe uses: a slot shows only when the stage that needs it is on. */
export function wizardSlotsOf(recipe: Pick<Recipe, 'graph'>): WizardSlotSpec[] {
  const enabled = enabledStagesOf(recipe);
  return wizardSlotSpecs.filter((spec) => spec.stage === null || enabled.has(spec.stage));
}

export function basePinOf(recipe: Pick<Recipe, 'bindings'>, slot: WizardSlot): Binding | undefined {
  return recipe.bindings.find((binding) => binding.slot === slot);
}

/** The ref a slot ends with: the owner's answer when it is still a known option, else the base pin. */
export function chosenRefOf(recipe: Pick<Recipe, 'bindings'>, choices: WizardChoices, slot: WizardSlot, options: readonly BindingOption[]): string {
  const basePin = basePinOf(recipe, slot)?.ref ?? '';
  const choice = choices[slot];
  if (choice === undefined || choice === basePin) return basePin;
  if (choice === '') return '';
  // A choice kept in the session whose version is no longer offered falls back to the recipe's pin.
  return options.some((option) => option.ref === choice) ? choice : basePin;
}

/** The music choice a recipe stores in its `music` stage params; "Choose the song" when it says nothing. */
export function musicChoiceOfRecipe(recipe: Pick<Recipe, 'graph'>): MusicChoice {
  return musicChoiceOf(recipe.graph.stages.find((stage) => stage.stageId === 'music')?.params ?? {});
}

function sameMusicChoice(left: MusicChoice, right: MusicChoice): boolean {
  if (left.mode === 'track' || right.mode === 'track') return left.mode === right.mode;
  return left.categories.length === right.categories.length && left.categories.every((category) => right.categories.includes(category));
}

/** The owner's step 3 answers the recipe is composed from. */
export interface WizardAnswers {
  choices: WizardChoices;
  /** null keeps the base recipe's music choice. */
  musicChoice: MusicChoice | null;
  /** null keeps the base recipe's canvas, aspect and fps. */
  format: ResolvedFormat | null;
}

export interface ComposedRecipe {
  /** The base recipe with the step 3 pins, for the composition rules. */
  recipe: Recipe;
  /** A pin differs from the base recipe's: "Iniciar" saves a new draft version first. */
  changed: boolean;
}

function kindOfSlot(slot: WizardSlot): AssetKind {
  return wizardSlotSpecs.find((spec) => spec.slot === slot)?.kind ?? 'ai-model';
}

/**
 * The base recipe with the owner's voice and style. Unchanged slots keep the base binding (and its
 * hash); a changed slot takes the option's hash. Slots of stages the recipe does not run are left
 * as the base has them. "AI decides" goes into the music stage's params and leaves the music slot
 * empty (docs/specs/2026-11-25-ai-music-choice-design.md).
 */
export function composeRecipe(base: Recipe, answers: WizardAnswers, options: readonly BindingOption[]): ComposedRecipe {
  const { choices } = answers;
  const musicOn = enabledStagesOf(base).has('music');
  const baseMusic = musicChoiceOfRecipe(base);
  const music = musicOn && answers.musicChoice !== null ? answers.musicChoice : baseMusic;
  let bindings: Binding[] = [...base.bindings];
  const addedKinds = new Set<AssetKind>();
  let changed = false;
  for (const spec of wizardSlotsOf(base)) {
    const basePin = basePinOf(base, spec.slot);
    const ref = spec.slot === 'music' && music.mode === 'auto' ? '' : chosenRefOf(base, choices, spec.slot, options);
    if (ref === (basePin?.ref ?? '')) continue;
    const option = options.find((candidate) => candidate.ref === ref);
    if (ref !== '' && option === undefined) continue;
    changed = true;
    const replacement: Binding | null = option === undefined ? null : { slot: spec.slot, ref: option.ref, contentHash: option.contentHash };
    if (replacement !== null) addedKinds.add(kindOfSlot(spec.slot));
    const others = bindings.filter((binding) => binding.slot !== spec.slot);
    if (replacement === null) bindings = others;
    else if (basePin === undefined) bindings = [...others, replacement];
    else bindings = bindings.map((binding) => (binding.slot === spec.slot ? replacement : binding));
  }
  // A new pin must be of a kind the recipe accepts, or core refuses the version.
  const allowedKinds = [...new Set<AssetKind>([...base.allowedKinds, ...addedKinds])];
  const newFormat = answers.format !== null && !sameFormat(answers.format, base.format);
  const format = newFormat && answers.format !== null ? { ...base.format, ...answers.format } : base.format;
  if (newFormat) changed = true;
  if (sameMusicChoice(music, baseMusic)) return { recipe: { ...base, bindings, allowedKinds, format }, changed };
  const stages = base.graph.stages.map((stage) => (stage.stageId === 'music' ? { ...stage, params: withMusicChoice(stage.params, music) } : stage));
  return { recipe: { ...base, graph: { ...base.graph, stages }, bindings, allowedKinds, format }, changed: true };
}

/**
 * The definition `saveRecipeVersion` takes (C2 minus id, version, status and timestamps), field by
 * field: the request schema is strict, so a lifecycle field left in would be refused.
 */
export function definitionOf(recipe: Recipe): RecipeDefinitionInput {
  return {
    name: recipe.name,
    description: recipe.description,
    owner: recipe.owner,
    provenance: recipe.provenance,
    notes: recipe.notes,
    graph: recipe.graph,
    bindings: recipe.bindings,
    format: recipe.format,
    gates: recipe.gates,
    inputs: recipe.inputs,
    checks: recipe.checks,
    limits: recipe.limits,
    rubric: recipe.rubric,
    checklist: recipe.checklist,
    allowedKinds: recipe.allowedKinds,
  };
}

/** Identifies one composed set of pins, music choice and format on one base version, so a retry reuses the version it already saved. */
export function compositionKeyOf(baseRef: string, recipe: Pick<Recipe, 'bindings' | 'graph' | 'format'>): string {
  const pins = wizardSlotIds.map((slot) => `${slot}=${basePinOf(recipe, slot)?.ref ?? ''}`);
  const music = musicChoiceOfRecipe(recipe);
  // "Choose the song" adds nothing, so keys remembered before the music choice existed still match.
  const musicKey = music.mode === 'track' ? '' : `|music=auto:${music.categories.join('+')}`;
  const { canvas, fps } = recipe.format;
  return `${baseRef}|${pins.join(',')}${musicKey}|format=${canvas.width}x${canvas.height}@${fps}`;
}
