import { type AssetVersionView } from '@studio/shared/api';
import { type StudioGlyphName } from '@/features/common/studio-artwork';
import { skillArtworkOf } from './skill-artwork';

/** The small animated scenes a skill card's cover can play. Decoration only, like the glyph they replace. */
export const skillStageKinds = [
  'timeline',
  'waveform',
  'captions',
  'paper',
  'checklist',
  'canvas',
  'bars',
  'graph',
  'lines',
  'chat',
  'grade',
  'logo',
  'fade',
  'sheet',
  'diff',
  'capture',
] as const;
export type SkillStageKind = (typeof skillStageKinds)[number];

/**
 * The scene of each known skill, by asset id, so the picture shows the work that skill does: the
 * producer interviews (chat), the script is a page (paper), the render fits a 9:16 canvas. The
 * choices follow the owner's Skill Deck page.
 */
const skillStages: Readonly<Record<string, SkillStageKind>> = {
  'fagmer-video-producer': 'chat',
  'fagmer-video-trend-research': 'graph',
  'fagmer-video-fact-check': 'checklist',
  'fagmer-video-script': 'paper',
  'fagmer-video-hook': 'captions',
  'fagmer-video-scene-generator': 'sheet',
  'fagmer-video-demo-capture': 'capture',
  'fagmer-video-voiceover': 'waveform',
  'fagmer-video-tiktok-render': 'canvas',
  'fagmer-video-quality-gate': 'grade',
  'fagmer-video-seo-package': 'lines',
  'fagmer-video-publish-review': 'diff',
  'fagmer-video-analytics-loop': 'bars',
  'fagmer-video-director': 'timeline',
  'fagmer-video-analyzer': 'waveform',
  'fagmer-video-subtitles': 'captions',
  'fagmer-video-rhythm': 'timeline',
  'fagmer-video-style': 'grade',
  'fagmer-video-composition': 'logo',
  'fagmer-video-motion': 'fade',
  'fagmer-video-render': 'canvas',
  'fagmer-video-reviewer': 'checklist',
};

/** A skill with no scene of its own plays the one of its artwork glyph; a glyph not listed here plays `lines`. */
const glyphStages: Partial<Record<StudioGlyphName, SkillStageKind>> = {
  camera: 'capture',
  waveform: 'waveform',
  scissors: 'timeline',
  motion: 'fade',
  chart: 'bars',
  upload: 'checklist',
  check: 'checklist',
  megaphone: 'captions',
  script: 'paper',
  film: 'canvas',
  clapperboard: 'timeline',
  palette: 'grade',
  magnifier: 'graph',
  reel: 'timeline',
};

/** The scene on a skill's cover: its own when the skill is known, else the one its words point to. */
export function skillStageOf(skill: Pick<AssetVersionView, 'id' | 'name' | 'tags'>): SkillStageKind {
  return skillStages[skill.id] ?? glyphStages[skillArtworkOf(skill).glyph] ?? 'lines';
}
