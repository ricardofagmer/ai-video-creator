import type { ReactElement, ReactNode } from 'react';
import styles from '../skills-hero.module.css';
import { SkillGlyph } from './SkillGlyph';

interface SkillsHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  /** Short facts under the description, such as "14 skills". */
  facts: readonly string[];
  actions: ReactNode;
}

const GRADIENT_ID = 'skills-hero-gradient';
const reelHoles = [0, 72, 144, 216, 288] as const;
const stripFrames = [0, 1, 2, 3] as const;
const stripHoles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const waveBars = [18, 34, 52, 30, 60, 40, 22, 46, 28] as const;

/** Decorative film reel, film strip and waveform, drawn with the brand gradient. */
function HeroArt(): ReactElement {
  return (
    <svg viewBox="0 0 360 180" className={styles.art} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" className={styles.stopStart} />
          <stop offset="0.5" className={styles.stopMiddle} />
          <stop offset="1" className={styles.stopEnd} />
        </linearGradient>
      </defs>
      <g className={styles.wave} fill={`url(#${GRADIENT_ID})`}>
        {waveBars.map((height, index) => (
          <rect key={index} x={14 + index * 14} y={56 - height / 2} width="7" height={height} rx="3.5" className={styles.waveBar} />
        ))}
      </g>
      <g transform="rotate(-7 120 132)">
        <rect x="8" y="104" width="216" height="58" rx="8" className={styles.strip} />
        {stripHoles.map((index) => (
          <rect key={`top-${index}`} x={16 + index * 17.4} y="109" width="9" height="5" rx="1.5" className={styles.stripHole} />
        ))}
        {stripHoles.map((index) => (
          <rect key={`bottom-${index}`} x={16 + index * 17.4} y="152" width="9" height="5" rx="1.5" className={styles.stripHole} />
        ))}
        {stripFrames.map((index) => (
          <rect key={index} x={17 + index * 51} y="119" width="45" height="28" rx="4" className={styles.stripFrame} />
        ))}
        <path d="M84 126v14l12-7z" fill={`url(#${GRADIENT_ID})`} />
      </g>
      <g className={styles.reel}>
        <circle cx="282" cy="86" r="66" className={styles.reelBody} stroke={`url(#${GRADIENT_ID})`} />
        {reelHoles.map((angle) => (
          <circle key={angle} cx="282" cy="48" r="14" transform={`rotate(${angle} 282 86)`} className={styles.reelHole} />
        ))}
        <circle cx="282" cy="86" r="9" fill={`url(#${GRADIENT_ID})`} />
      </g>
    </svg>
  );
}

/** Title block of the Skills page: the page's single `<h1>`, the facts and the actions over a cinema banner. */
export function SkillsHero({ eyebrow, title, description, facts, actions }: SkillsHeroProps): ReactElement {
  return (
    <header className={styles.hero}>
      <div className={styles.text}>
        <p className={`overline ${styles.eyebrow}`}>
          <SkillGlyph name="clapperboard" className={styles.eyebrowGlyph} />
          {eyebrow}
        </p>
        <h1 className="heading-1">{title}</h1>
        <p className={`body-sm ${styles.description}`}>{description}</p>
        <ul className={styles.facts}>
          {facts.map((fact, index) => (
            <li key={fact} className={styles.fact}>
              <SkillGlyph name={index === 0 ? 'reel' : 'film'} className={styles.factGlyph} />
              {fact}
            </li>
          ))}
        </ul>
        <div className={styles.actions}>{actions}</div>
      </div>
      <HeroArt />
    </header>
  );
}
