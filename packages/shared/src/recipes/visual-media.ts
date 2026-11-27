import { type AssetKind } from '../catalog/asset-kind';
import { type Brief } from './brief';
import { type Recipe } from './recipe';

/**
 * "No video without pictures" (docs/specs/2026-11-25-site-capture-and-visual-media-design.md).
 * Pure and browser-safe, so the web forms and core run the same check; core stays authoritative.
 */
export const visualMediaProblems = ['site-capture-unanswered', 'site-capture-disabled', 'no-visual-media'] as const;
export type VisualMediaProblem = (typeof visualMediaProblems)[number];

/** Reference sub-kinds the scenes can put on screen. */
const pictureSubKinds: readonly string[] = ['image', 'video', 'screenshot-set'];

/** What the rule reads of one catalog item on the run or bound to the preset. */
export interface VisualMediaCandidate {
  kind: AssetKind;
  /** The `reference` sub-kind; ignored for every other kind. */
  subKind?: string;
  /** Biometric items never reach the director, so they are not pictures of the video. */
  biometric: boolean;
}

export function isPicture(candidate: VisualMediaCandidate): boolean {
  if (candidate.biometric) return false;
  if (candidate.kind === 'image') return true;
  return candidate.kind === 'reference' && candidate.subKind !== undefined && pictureSubKinds.includes(candidate.subKind);
}

export interface VisualMediaFacts {
  brief: Pick<Brief, 'sourceUrl' | 'siteCapture'>;
  /** The preset as this run uses it (`recipeForBrief`). */
  recipe: Pick<Recipe, 'graph'>;
  /** Pictures on the run (its references) and bound to the preset. */
  pictureCount: number;
}

/** The first reason this run cannot have a picture on screen, or null when it can. */
export function visualMediaProblem(facts: VisualMediaFacts): VisualMediaProblem | null {
  const hasSite = (facts.brief.sourceUrl ?? '') !== '';
  if (hasSite && facts.brief.siteCapture === undefined) return 'site-capture-unanswered';
  const usesSite = hasSite && facts.brief.siteCapture === 'use';
  const captureRuns = facts.recipe.graph.stages.some((stage) => stage.stageId === 'capture' && stage.enabled);
  if (usesSite && !captureRuns) return 'site-capture-disabled';
  if (!usesSite && facts.pictureCount === 0) return 'no-visual-media';
  return null;
}
