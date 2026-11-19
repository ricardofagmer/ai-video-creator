import { type ComparisonView } from '@studio/shared/api';
import { type Sha256 } from '@studio/shared/catalog';
import { canonicalJson, type BindingSlot, type Brief, type Recipe } from '@studio/shared/recipes';
import { type ComparisonSubject, type RunComparisonLink, type RunFile } from '@studio/shared/run-format';
import { sha256Hex } from '../asset-store/hashing';

export type ComparisonVerified = ComparisonView['verified'];

/** `briefHash`: sha-256 of the canonical JSON of the brief, equal on both arms (section 5.3 "Link"). */
export function briefHashOf(brief: Brief): Sha256 {
  return sha256Hex(canonicalJson(brief));
}

/**
 * The part of a recipe that must be equal on both arms of an `asset-binding` comparison: all of
 * it except `version`, `provenance` and the binding in `slot`. The lifecycle fields (`status`,
 * `createdAt`, `updatedAt`) are not part of a recipe definition (SPEC 0002 rev 2: they are outside
 * `contentHash`), so they are neutralised too. Order of the other bindings is kept.
 */
export function comparableRecipeDefinition(recipe: Recipe, slot: BindingSlot): string {
  return canonicalJson({
    ...recipe,
    version: 0,
    provenance: null,
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    bindings: recipe.bindings.filter((binding) => binding.slot !== slot),
  });
}

export function boundRefOf(recipe: Recipe, slot: BindingSlot): string | null {
  return recipe.bindings.find((binding) => binding.slot === slot)?.ref ?? null;
}

export interface VerifiableArm {
  run: RunFile;
  link: RunComparisonLink;
}

function sameBrief(armA: VerifiableArm, armB: VerifiableArm): boolean {
  const briefA = canonicalJson(armA.run.brief);
  return (
    briefA === canonicalJson(armB.run.brief) &&
    sha256Hex(briefA) === armA.link.briefHash &&
    armA.link.briefHash === armB.link.briefHash
  );
}

function onlyComparedDiffers(subject: ComparisonSubject, armA: VerifiableArm, armB: VerifiableArm): boolean {
  if (canonicalJson(armA.link.subject) !== canonicalJson(armB.link.subject)) return false;
  const recipeA = armA.run.recipe.definition;
  const recipeB = armB.run.recipe.definition;
  if (subject.kind === 'recipe-version') {
    return recipeA.id === recipeB.id && armA.run.recipe.ref === subject.a && armB.run.recipe.ref === subject.b;
  }
  return (
    comparableRecipeDefinition(recipeA, subject.slot) === comparableRecipeDefinition(recipeB, subject.slot) &&
    boundRefOf(recipeA, subject.slot) === subject.a &&
    boundRefOf(recipeB, subject.slot) === subject.b
  );
}

/**
 * The three `verified` flags (section 5.3 "Side-by-side view"), read from the two frozen run.json
 * files at request time; the web shows a warning when any is false. `subject` is arm A's link.
 */
export function verifyComparison(subject: ComparisonSubject, armA: VerifiableArm, armB: VerifiableArm): ComparisonVerified {
  return {
    sameBrief: sameBrief(armA, armB),
    sameReferences: canonicalJson(armA.run.references) === canonicalJson(armB.run.references),
    onlyComparedDiffers: onlyComparedDiffers(subject, armA, armB),
  };
}
