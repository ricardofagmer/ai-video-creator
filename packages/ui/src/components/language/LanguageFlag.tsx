import { useId, type ReactElement } from 'react';
import type { Locale } from '../../i18n/locale';

/** US stripe height: 13 stripes over the 24-unit box. */
const STRIPE = 24 / 13;

/** Stars of the US canton, simplified to a staggered grid of dots. */
const US_STARS: readonly (readonly [number, number])[] = [
  [3, 2.6], [6, 2.6], [9, 2.6],
  [4.5, 5.4], [7.5, 5.4], [10.5, 5.4],
  [3, 8.2], [6, 8.2], [9, 8.2],
  [4.5, 11], [7.5, 11], [10.5, 11],
];

function BrazilArt(): ReactElement {
  return (
    <>
      <rect width="24" height="24" fill="#009C3B" />
      <polygon points="12,3.5 21.5,12 12,20.5 2.5,12" fill="#FFDF00" />
      <circle cx="12" cy="12" r="4.6" fill="#002776" />
      <path d="M7.5 11.2Q12 9.6 16.5 12.7" fill="none" stroke="#FFFFFF" strokeWidth="1.1" />
    </>
  );
}

function SpainArt(): ReactElement {
  return (
    <>
      <rect width="24" height="24" fill="#AA151B" />
      <rect y="6" width="24" height="12" fill="#F1BF00" />
    </>
  );
}

function UnitedStatesArt(): ReactElement {
  return (
    <>
      <rect width="24" height="24" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map((index) => (
        <rect key={index} y={index * STRIPE} width="24" height={STRIPE} fill="#FFFFFF" />
      ))}
      <rect width="12" height={7 * STRIPE} fill="#3C3B6E" />
      {US_STARS.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.6" fill="#FFFFFF" />
      ))}
    </>
  );
}

const ART: Readonly<Record<Locale, () => ReactElement>> = {
  'pt-BR': BrazilArt,
  es: SpainArt,
  en: UnitedStatesArt,
};

export interface LanguageFlagProps {
  locale: Locale;
  className?: string;
}

/**
 * Round flag for a locale (pt-BR Brazil, es Spain, en United States). Inline SVG instead of
 * emoji flags, which Windows shows as two letters. Decorative: the button carries the name.
 */
export function LanguageFlag({ locale, className }: LanguageFlagProps): ReactElement {
  const clipId = `vs-flag-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const Art = ART[locale];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <clipPath id={clipId}>
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <Art />
      </g>
    </svg>
  );
}
