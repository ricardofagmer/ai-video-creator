import type { ReactElement } from 'react';
import { type SkillGlyphName } from '../skill-artwork';

const glyphs: Record<SkillGlyphName, ReactElement> = {
  camera: (
    <>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10.5l5.5-3v9l-5.5-3" />
    </>
  ),
  waveform: <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4" />,
  scissors: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8.2 8.3L20 17M8.2 15.7L20 7" />
    </>
  ),
  motion: (
    <>
      <path d="M3 19c4 0 5-10 9-10s5 10 9 10" />
      <path d="M12 3l2 3-2 3-2-3z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16M7 16v-3M12 16v-6M17 16v-4" />
      <path d="M6 8l4-3 4 2 5-4" />
    </>
  ),
  upload: <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />,
  check: (
    <>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4h3l8 4V6l-8 4z" />
      <path d="M18 9.5a3.5 3.5 0 0 1 0 5M8 14.5l1 4.5h2.5l-1-4" />
    </>
  ),
  script: <path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5" />,
  film: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" />
    </>
  ),
  clapperboard: (
    <>
      <path d="M4 11h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 11L3.300 7.500l15.400-3.200.7 3.500z" />
      <path d="M8 6.500l1.800 3.300M12.500 5.600l1.800 3.300" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.500 0 2-1 2-2 0-1.500 1-2 2.500-2H18a3 3 0 0 0 3-3c0-6-4-9-9-9z" />
      <circle cx="8" cy="10" r="1" />
      <circle cx="12" cy="7.500" r="1" />
      <circle cx="16" cy="10" r="1" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.500-4.500" />
    </>
  ),
  reel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="1.500" />
      <circle cx="12" cy="7" r="1.500" />
      <circle cx="12" cy="17" r="1.500" />
      <circle cx="7" cy="12" r="1.500" />
      <circle cx="17" cy="12" r="1.500" />
    </>
  ),
};

interface SkillGlyphProps {
  name: SkillGlyphName;
  className?: string;
}

/** A media glyph of the Skills page, always decorative: the skill's name and category say what it is. */
export function SkillGlyph({ name, className }: SkillGlyphProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {glyphs[name]}
    </svg>
  );
}
