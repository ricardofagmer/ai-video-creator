import { type AssetVersionView } from '@studio/shared/api';
import { type AssetKind } from '@studio/shared/catalog';
import { isSiteReference } from '@/features/catalog/site-link-draft';
import { type PipelineItem } from './wizard-draft';
import { type WizardChoices, type WizardSlot } from './wizard-recipe';

/** C10 `CreateRunRequest.references` holds at most 50 refs; references and pipeline items share them. */
export const MAX_RUN_ITEMS = 50;

/** The tabs of the "Add to pipeline" step, in the order the owner asked for them. */
export const pipelineTabs = ['sites', 'skills', 'templates', 'prompts', 'ai-writing', 'media-brand'] as const;
export type PipelineTab = (typeof pipelineTabs)[number];

/** Skills have their own tab here, so "AI & writing" lists the models only. */
const tabKinds: Readonly<Record<PipelineTab, readonly AssetKind[]>> = {
  sites: ['reference'],
  skills: ['skill'],
  templates: ['template'],
  prompts: ['prompt'],
  'ai-writing': ['ai-model'],
  'media-brand': ['music', 'sfx', 'brand-kit'],
};

export function kindsOfPipelineTab(tab: PipelineTab): readonly AssetKind[] {
  return tabKinds[tab];
}

/** The search cannot filter by reference sub-kind, so Sites keeps only the website references. */
export function versionInPipelineTab(tab: PipelineTab, version: AssetVersionView): boolean {
  if (!tabKinds[tab].includes(version.kind)) return false;
  return tab !== 'sites' || isSiteReference(version);
}

/** Kinds that also fill a preset pin when the owner left that pin as the preset has it. */
const pinOfKind: Partial<Record<AssetKind, WizardSlot>> = {
  template: 'template',
  'brand-kit': 'brand-kit',
  music: 'music',
};

/**
 * The step 3 choices with the pins the pipeline items imply: the first template, brand kit and
 * music added become the preset's pins unless the owner chose that slot in "Voice and style".
 */
export function choicesWithPipelinePins(choices: WizardChoices, items: readonly PipelineItem[]): WizardChoices {
  const implied: Partial<Record<WizardSlot, string>> = {};
  for (const item of items) {
    const slot = pinOfKind[item.kind];
    if (slot !== undefined && implied[slot] === undefined) implied[slot] = item.ref;
  }
  return { ...implied, ...choices };
}

/** Every ref the run takes: the references, then the pipeline items, once each and at most 50. */
export function runReferencesOf(references: readonly string[], items: readonly PipelineItem[]): string[] {
  return [...new Set([...references, ...items.map((item) => item.ref)])].slice(0, MAX_RUN_ITEMS);
}
