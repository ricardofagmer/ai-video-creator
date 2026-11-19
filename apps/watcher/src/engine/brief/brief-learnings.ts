import { capLearningsForBrief, type BriefRefLearnings } from '@studio/core/learnings';
import { type AssetRef, type IsoDateTime, type LearningNote } from '@studio/shared/catalog';
import { type BindingSlot } from '@studio/shared/recipes';
import { type RunFile } from '@studio/shared/run-format';
import { renderLearningBlock, renderLearningEntryHeader, type StageBriefLearning, type StageBriefLearnings } from './learnings-section';

/** C3 caps `StageBriefSchema.learnings` at 64 entries. */
const MAX_LEARNING_ENTRIES = 64;

/**
 * Rendered size of the learnings section in `instructions` (blocks and header lines). C3 caps
 * `instructions` at 20,000 characters; the 4,000-character text cap alone does not bound the block
 * overhead of many short notes, so notes past this budget are counted in `omitted` instead of making
 * the brief fail validation. Real notes (up to 500 characters each) reach the text cap first.
 */
const LEARNINGS_SECTION_MAX_RENDERED_CHARS = 12_000;

export interface LearningRefSlot {
  slot: BindingSlot | null;
  ref: AssetRef;
}

export interface RefNotes {
  ref: AssetRef;
  notes: readonly LearningNote[];
}

/** B18: a comparison arm uses the comparison's creation time; every other run its own. */
export function learningsCutoff(run: Readonly<RunFile>): IsoDateTime {
  return run.comparison?.learningsCutoff ?? run.createdAt;
}

/**
 * Section 5.5 step 2: the recipe bindings, then the run references, each ref once (a binding keeps
 * its slot). Biometric versions carry no notes (B17) and the core read query excludes them (B18),
 * so they need no sensitivity lookup here.
 */
export function learningRefs(run: Readonly<RunFile>): LearningRefSlot[] {
  const slots = new Map<AssetRef, BindingSlot | null>();
  for (const binding of run.recipe.definition.bindings) if (!slots.has(binding.ref)) slots.set(binding.ref, binding.slot);
  for (const ref of run.references) if (!slots.has(ref)) slots.set(ref, null);
  return [...slots].map(([ref, slot]) => ({ slot, ref }));
}

function visibleAt(note: LearningNote, cutoffMs: number): boolean {
  return Date.parse(note.createdAt) <= cutoffMs && (note.retiredAt === null || Date.parse(note.retiredAt) > cutoffMs);
}

function newestFirst(left: LearningNote, right: LearningNote): number {
  const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (byTime !== 0) return byTime;
  return right.noteId < left.noteId ? -1 : right.noteId > left.noteId ? 1 : 0;
}

/**
 * Re-applies the port contract on the watcher side, so the brief does not depend on the adapter
 * for it: only requested refs, only notes of that ref, the B18 cutoff rule, each note once, newest
 * first, in the order the refs were requested.
 */
function alignToRequested(refs: readonly LearningRefSlot[], read: readonly RefNotes[], cutoff: IsoDateTime): RefNotes[] {
  const cutoffMs = Date.parse(cutoff);
  const byRef = new Map<AssetRef, Map<string, LearningNote>>(refs.map(({ ref }) => [ref, new Map()]));
  for (const entry of read) {
    const notes = byRef.get(entry.ref);
    if (notes === undefined) continue;
    for (const note of entry.notes) if (note.ref === entry.ref && visibleAt(note, cutoffMs)) notes.set(note.noteId, note);
  }
  return refs.map(({ ref }) => ({ ref, notes: [...(byRef.get(ref)?.values() ?? [])].sort(newestFirst) }));
}

/**
 * Keeps a prefix of the capped notes whose rendered section fits the size budget; the rest is
 * counted in `omitted`, so the JSON list and the rendered section always hold the same notes.
 */
function fitRenderedBudget(entries: readonly StageBriefLearning[]): StageBriefLearning[] {
  let remaining = LEARNINGS_SECTION_MAX_RENDERED_CHARS;
  let budgetSpent = false;
  return entries.map((entry) => {
    remaining -= renderLearningEntryHeader(entry).length + 1;
    const kept: StageBriefLearning['notes'] = [];
    for (const note of entry.notes) {
      const size = renderLearningBlock(entry.ref, note).length + 1;
      if (budgetSpent || size > remaining) {
        budgetSpent = true;
        continue;
      }
      remaining -= size;
      kept.push(note);
    }
    return { ...entry, notes: kept, omitted: entry.omitted + entry.notes.length - kept.length };
  });
}

function withSlot(capped: BriefRefLearnings, slots: ReadonlyMap<AssetRef, BindingSlot | null>): StageBriefLearning {
  return { slot: slots.get(capped.ref) ?? null, ref: capped.ref, notes: capped.notes, omitted: capped.omitted };
}

/**
 * Section 5.5 step 4 and B18: per ref the newest 10 notes, at most 4,000 characters of note text
 * per brief (core `capLearningsForBrief`), then the rendered-size budget. Only refs that have notes
 * (kept or omitted) get an entry; an empty list means "no note at the cutoff", which differs from an
 * absent `learnings` ("rendered before R2").
 */
export function selectBriefLearnings(options: {
  refs: readonly LearningRefSlot[];
  read: readonly RefNotes[];
  cutoff: IsoDateTime;
}): StageBriefLearnings {
  const slots = new Map<AssetRef, BindingSlot | null>(options.refs.map(({ ref, slot }) => [ref, slot]));
  const capped = capLearningsForBrief(alignToRequested(options.refs, options.read, options.cutoff))
    .filter((entry) => entry.notes.length > 0 || entry.omitted > 0)
    .slice(0, MAX_LEARNING_ENTRIES)
    .map((entry) => withSlot(entry, slots));
  return fitRenderedBudget(capped);
}
