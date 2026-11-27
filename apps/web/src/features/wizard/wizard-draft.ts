import { AssetKindSchema, AssetRefSchema, MusicCategoryListSchema, type AssetKind } from '@studio/shared/catalog';
import { BRIEF_INSTRUCTIONS_MAX, RecipeRefSchema, type MusicChoice } from '@studio/shared/recipes';
import { z } from 'zod';
import { type NewRunFormValues } from '@/features/runs/new-run-model';
import { draftSteps, type DraftStep } from './wizard-steps';
import { formatPresetIds, type WizardFormat } from './wizard-format';
import { type WizardChoices } from './wizard-recipe';

/** sessionStorage key of the answers of steps 0 to 4 (guided-creation spec section 5). */
export const WIZARD_STORAGE_KEY = 'studio.wizard.v1';

/** C10 `CreateRunRequest.references` holds at most 50 refs (the picker's own bound). */
const MAX_DRAFT_REFERENCES = 50;

/** A recipe version "Iniciar" already saved for these pins, reused when the run creation is retried. */
export interface SavedComposition {
  key: string;
  ref: string;
}

/** One catalog item added in the "Add to pipeline" step; the kind decides whether it also fills a preset pin. */
export interface PipelineItem {
  ref: string;
  kind: AssetKind;
}

/** What the owner answered so far; nothing here is a secret, and the api validates all of it again. */
export interface WizardDraft {
  step: DraftStep;
  values: NewRunFormValues;
  instructions: string;
  references: readonly string[];
  /** Sites, skills, templates, prompts, models and media added after the references. */
  pipelineItems: readonly PipelineItem[];
  choices: WizardChoices;
  /** "Choose the song" or "AI decides" with its categories; null keeps the base preset's choice. */
  musicChoice: MusicChoice | null;
  /** Canvas and fps for this video, from a suggested format or typed; null keeps the base preset's. */
  format: WizardFormat | null;
  saved: SavedComposition | null;
}

const refOrEmpty = z.union([z.literal(''), AssetRefSchema]);

const MusicChoiceDraftSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('track') }).strict(),
  z.object({ mode: z.literal('auto'), categories: MusicCategoryListSchema }).strict(),
]);

// Loose upper bounds: they only keep a tampered or stale entry from growing the page; the
// brief's own rules are checked by `buildBrief` and by the api.
const WizardDraftSchema = z
  .object({
    step: z.enum(draftSteps),
    values: z
      .object({
        recipeRef: z.union([z.literal(''), RecipeRefSchema]),
        topic: z.string().max(1000),
        sourceUrl: z.string().max(4096),
        // Drafts saved before the question existed have no key: the owner answers it on the way.
        siteCapture: z.enum(['', 'use', 'skip']).default(''),
        keyMessages: z.string().max(8000),
        targetDurationSec: z.string().max(10),
      })
      .strict(),
    instructions: z.string().max(BRIEF_INSTRUCTIONS_MAX),
    references: z.array(AssetRefSchema).max(MAX_DRAFT_REFERENCES),
    // Drafts saved before the pipeline step existed have no key: they start with none.
    pipelineItems: z
      .array(z.object({ ref: AssetRefSchema, kind: AssetKindSchema }).strict())
      .max(MAX_DRAFT_REFERENCES)
      .default([]),
    choices: z
      .object({ voice: refOrEmpty.optional(), template: refOrEmpty.optional(), 'brand-kit': refOrEmpty.optional(), music: refOrEmpty.optional() })
      .strict(),
    // Drafts saved before the music choice existed have no key: they keep the preset's choice.
    musicChoice: MusicChoiceDraftSchema.nullable().default(null),
    // Drafts saved before the format choice existed have no key: they keep the preset's format.
    format: z
      .object({ preset: z.enum(formatPresetIds), width: z.string().max(10), height: z.string().max(10), fps: z.string().max(10) })
      .strict()
      .nullable()
      .default(null),
    saved: z.object({ key: z.string().max(2000), ref: RecipeRefSchema }).strict().nullable(),
  })
  .strict();

export function emptyDraft(recipeRef: string): WizardDraft {
  return {
    step: 'idea',
    values: { recipeRef, topic: '', sourceUrl: '', siteCapture: '', keyMessages: '', targetDurationSec: '' },
    instructions: '',
    references: [],
    pipelineItems: [],
    choices: {},
    musicChoice: null,
    format: null,
    saved: null,
  };
}

/** The stored text as a draft, or null when it is absent, not JSON or not a draft of this version. */
export function parseDraft(text: string | null): WizardDraft | null {
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = WizardDraftSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** The draft with a base recipe that no longer runs dropped, so the owner chooses again. */
export function draftForRecipes(draft: WizardDraft, runnableRefs: readonly string[]): WizardDraft {
  if (draft.values.recipeRef === '' || runnableRefs.includes(draft.values.recipeRef)) return draft;
  return { ...draft, values: { ...draft.values, recipeRef: '' }, choices: {}, musicChoice: null, format: null, saved: null };
}
