import { type AssetVersionView } from '@studio/shared/api';
import { studioArtworkOf, type StudioArtwork, type StudioGlyphName } from '@/features/common/studio-artwork';
import { skillCategories, skillCategoryOf, type SkillCategory } from './skill-categories';

/** First match wins, so the more specific words come first ("analytics" before "analysis"). */
const keywordGlyphs: readonly (readonly [RegExp, StudioGlyphName])[] = [
  [/captur|record|screen|camera|footage/, 'camera'],
  [/audio|music|sound|voice|narrat|sfx|podcast/, 'waveform'],
  [/edit|cut|cort|trim|rhythm|ritmo|paus|montage/, 'scissors'],
  [/motion|anim|transition|graphic|overlay/, 'motion'],
  [/analytic|metric|insight|report|stat/, 'chart'],
  [/publish|upload|schedule|post/, 'upload'],
  [/fact|check|review|quality|gate|audit/, 'check'],
  [/hook|headline|promo|teaser/, 'megaphone'],
  [/script|writ|copy|caption|subtitle|roteir/, 'script'],
  [/render|export|encode|tiktok|shorts/, 'film'],
  [/scene|storyboard|direct|produc|compos/, 'clapperboard'],
  [/style|colou?r|grade|brand|logo/, 'palette'],
  [/research|search|seo|analy|inspect/, 'magnifier'],
];

const categoryGlyphs: Record<SkillCategory, StudioGlyphName> = {
  editing: 'scissors',
  motion: 'motion',
  audio: 'waveform',
  writing: 'script',
  analysis: 'magnifier',
  publishing: 'upload',
  other: 'reel',
};

const categoryTags: ReadonlySet<string> = new Set(skillCategories);

/**
 * The picture on a skill's card: one media glyph and one colour tone. It is decoration only, read
 * from the skill's own id, name and tags so two skills of the same category still look different;
 * a skill no keyword describes falls back to its category's glyph. Category tags are left out of
 * the keyword text, so the category only decides when the skill's own words say nothing.
 */
export function skillArtworkOf(skill: Pick<AssetVersionView, 'id' | 'name' | 'tags'>): StudioArtwork {
  const ownTags = skill.tags.filter((tag) => !categoryTags.has(tag));
  const text = `${skill.id} ${skill.name} ${ownTags.join(' ')}`.toLowerCase();
  const glyph = keywordGlyphs.find(([pattern]) => pattern.test(text))?.[1] ?? categoryGlyphs[skillCategoryOf(skill)];
  return studioArtworkOf(glyph);
}
