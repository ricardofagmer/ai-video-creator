import type { HookSection } from '@studio/shared/ace';
import { brand } from '../theme';

export const hookColors = {
  background: brand.background,
  text: brand.text,
  muted: brand.muted,
  accent: brand.accent,
  alarm: '#FF5A5F',
  amber: '#F6B73C',
  violet: '#9B8CFF',
  green: '#3DDC97',
  window: '#0F1A2E',
  windowBar: '#16233D',
  windowEdge: 'rgba(244, 247, 251, 0.10)',
  dim: 'rgba(244, 247, 251, 0.45)',
} as const;

/** One colour per git write the guard catches; the same four make the logo at the end. */
export const motifColors = [hookColors.accent, hookColors.amber, hookColors.violet, hookColors.alarm] as const;

export const monoFont = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
export const sansFont = 'Inter, "Helvetica Neue", "Segoe UI", Arial, sans-serif';

/** Background light follows the energy curve: colour as dramaturgy. */
export const sectionGlow: Record<HookSection, string> = {
  intro: '#1E5BFF',
  silence: '#3A4458',
  drop: '#FF3B47',
  groove: '#14B8A6',
  full: '#2EC4B6',
  tension: '#B4235A',
  warm: '#F59E0B',
  resolve: '#2EC4B6',
};
