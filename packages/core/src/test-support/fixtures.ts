import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Recipe } from '@studio/shared/recipes';
import { RunFileSchema, type ApprovalFile, type GateDecision, type RunFile } from '@studio/shared/run-format';
import { type CreateAssetInput } from '../catalog';
import { type SaveLearningFromRunInput } from '../learnings';
import { type FinalGateDecision } from '../outcomes';
import { type CreateRecipeInput, type RecipeDraftInput } from '../recipes';

/*
 * Fixture builders of SPEC 2026-11-21-r1-r2-curator-coverage section 8.1 (rev 1). Each builder
 * returns the input the real write path takes, never a database row: an asset goes through
 * `CreateAssetCommand`, a recipe through `CreateRecipeCommand`, a learning through
 * `SaveLearningFromRunCommand`, and a run through `writeRunFile` / `writeApprovalFile` and
 * `RunOutcomeRecorder`. No builder writes SQL. The run and recipe bodies are the watcher's
 * committed offline fixture, read only (the same source `run-fixture.harness.test.ts` uses).
 * Ids are allocated from a per-process counter, so two calls never collide in one database.
 */

const WATCHER_FIXTURE_DIR = resolve(__dirname, '..', '..', '..', '..', 'apps', 'watcher', 'fixtures', 'product-tour-16x9');

/** The owner every fixture names; a test identity, never a real person. */
const FIXTURE_OWNER = 'owner';

/** The instant a reviewed fixture run was decided: one hour after the fixture run was created. */
const FIXTURE_DECIDED_AT = '2026-11-18T13:00:00.000Z';

/** Crockford base32 without I, L, O and U: the ULID alphabet `RunIdSchema` accepts. */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Fixed first 20 characters of every fixture run id; the last 6 encode the counter. */
const RUN_ID_STEM = '01JD2Q7F3M8V5K9X4T6R';

/** Create input of an asset: `new CreateAssetCommand(fixtures.asset())`. */
export type AssetFixture = CreateAssetInput;

/** Create input of a recipe: `new CreateRecipeCommand(fixtures.recipe())`. */
export type RecipeFixture = CreateRecipeInput;

/** Save input of a learning note: `new SaveLearningFromRunCommand(fixtures.learningNote(text))`. */
export type LearningNoteFixture = SaveLearningFromRunInput;

/**
 * One run folder's content: `run.json`, `approval.json`, and the final decision in force (the
 * `decision` `RunOutcomeRecorder.record` takes), null while the run has no final review.
 */
export interface RunFixture {
  run: RunFile;
  approval: ApprovalFile;
  finalDecision: FinalGateDecision | null;
}

let sequence = 0;

function nextSequence(): number {
  sequence += 1;
  return sequence;
}

function base32(value: number, width: number): string {
  let text = '';
  let rest = value;
  for (let index = 0; index < width; index += 1) {
    text = `${ULID_ALPHABET.charAt(rest % ULID_ALPHABET.length)}${text}`;
    rest = Math.floor(rest / ULID_ALPHABET.length);
  }
  return text;
}

function nextRunId(): string {
  return `${RUN_ID_STEM}${base32(nextSequence(), 6)}`;
}

let cachedFixtureRun: RunFile | undefined;

/** The committed fixture run, parsed once; every caller gets its own deep copy. */
function fixtureRun(): RunFile {
  if (cachedFixtureRun === undefined) {
    const parsed: unknown = JSON.parse(readFileSync(resolve(WATCHER_FIXTURE_DIR, 'run.json'), 'utf8'));
    cachedFixtureRun = RunFileSchema.parse(parsed);
  }
  return structuredClone(cachedFixtureRun);
}

/** The owner-supplied fields of a recipe: every C2 field except the ones the studio sets. */
function draftOf(recipe: Recipe): RecipeDraftInput {
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

function planDecision(decidedAt: string): GateDecision {
  return { kind: 'plan', outcome: 'approved', decidedBy: FIXTURE_OWNER, decidedAt, notes: '', correlationId: null };
}

function asset(overrides: Partial<AssetFixture> = {}): AssetFixture {
  return {
    assetId: `coverage-prompt-${nextSequence()}`,
    kind: 'prompt',
    metadata: { name: 'Coverage prompt', owner: FIXTURE_OWNER, sensitivity: 'normal', details: { variables: [] } },
    content: { source: 'inline', text: '# Coverage prompt\n\nWrite a short product tour.\n', mimeType: 'text/markdown' },
    ...overrides,
  };
}

/**
 * The fixture recipe as a new draft. Its bindings pin the watcher fixture's catalog refs
 * (`product-tour-template@1`, `fagmer-brand@1`, `writer-prompt@1`, `spesia-music-680@1`), which a
 * test seeds first or replaces through `definition`.
 */
function recipe(overrides: Partial<RecipeFixture> = {}): RecipeFixture {
  return {
    recipeId: `coverage-recipe-${nextSequence()}`,
    definition: draftOf(fixtureRun().recipe.definition),
    ...overrides,
  };
}

/** A `pending` run whose plan is already approved, as the committed fixture is. */
function run(overrides: Partial<RunFixture> = {}): RunFixture {
  const body = fixtureRun();
  const runId = nextRunId();
  return {
    run: { ...body, runId },
    approval: { runId, decisions: [planDecision(body.createdAt)] },
    finalDecision: null,
    ...overrides,
  };
}

/** An `approved` run with a final review of `rating`; every checklist item of its recipe is checked. */
function reviewedRun(rating: 1 | 2 | 3 | 4 | 5, overrides: Partial<RunFixture> = {}): RunFixture {
  const body = fixtureRun();
  const runId = nextRunId();
  const finalDecision: FinalGateDecision = {
    kind: 'final',
    outcome: 'approved',
    decidedBy: FIXTURE_OWNER,
    decidedAt: FIXTURE_DECIDED_AT,
    notes: '',
    correlationId: null,
    rating,
    checklist: body.recipe.definition.checklist.map((item) => ({ itemId: item.id, checked: true })),
  };
  return {
    run: {
      ...body,
      runId,
      updatedAt: FIXTURE_DECIDED_AT,
      state: { status: 'approved', since: FIXTURE_DECIDED_AT, decidedBy: FIXTURE_OWNER },
    },
    approval: { runId, decisions: [planDecision(body.createdAt), finalDecision] },
    finalDecision,
    ...overrides,
  };
}

/**
 * A learning on `writer-prompt@1`, a ref the fixture run binds. `runId` names the committed
 * fixture run; a test sets it to the reviewed run it wrote.
 */
function learningNote(text: string): LearningNoteFixture {
  return { runId: fixtureRun().runId, ref: 'writer-prompt@1', text, createdBy: FIXTURE_OWNER };
}

export const fixtures: {
  asset(overrides?: Partial<AssetFixture>): AssetFixture;
  recipe(overrides?: Partial<RecipeFixture>): RecipeFixture;
  run(overrides?: Partial<RunFixture>): RunFixture;
  reviewedRun(rating: 1 | 2 | 3 | 4 | 5, overrides?: Partial<RunFixture>): RunFixture;
  learningNote(text: string): LearningNoteFixture;
} = { asset, recipe, run, reviewedRun, learningNote };
