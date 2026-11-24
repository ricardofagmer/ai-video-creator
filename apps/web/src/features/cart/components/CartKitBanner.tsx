import type { ReactElement } from 'react';
import styles from './CartKitBanner.module.css';

interface CartKitBannerProps {
  eyebrow: string;
  description: string;
  /** Short facts beside the description, such as "6 itens". */
  facts: readonly string[];
}

const GRADIENT_ID = 'cart-kit-gradient';
const reelHoles = [0, 72, 144, 216, 288] as const;
const waveBars = [10, 18, 26, 14, 22] as const;

/** Decorative shopping cart loaded with a video maker's kit: clapperboard, film reel and a waveform. */
function CartKitArt(): ReactElement {
  const gradient = `url(#${GRADIENT_ID})`;
  return (
    <svg viewBox="0 0 168 104" className={styles.art} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" className={styles.stopStart} />
          <stop offset="0.5" className={styles.stopMiddle} />
          <stop offset="1" className={styles.stopEnd} />
        </linearGradient>
      </defs>
      {/* Load first, so the basket's front edge sits over it. */}
      <g className={styles.wave} fill={gradient}>
        {waveBars.map((height, index) => (
          <rect key={index} x={104 + index * 8} y={44 - height} width="4.5" height={height} rx="2.25" className={styles.waveBar} />
        ))}
      </g>
      <g transform="rotate(-10 62 40)">
        <rect x="40" y="30" width="46" height="30" rx="4" className={styles.board} />
        <path d="M40 22h46v8H40z" className={styles.boardTop} />
        <path d="M46 22l-5 8M58 22l-5 8M70 22l-5 8M82 22l-5 8" className={styles.boardStripes} />
        <path d="M56 40v12l10-6z" fill={gradient} />
      </g>
      <g className={styles.reel}>
        <circle cx="100" cy="36" r="17" className={styles.reelBody} stroke={gradient} />
        {reelHoles.map((angle) => (
          <circle key={angle} cx="100" cy="26" r="4" transform={`rotate(${angle} 100 36)`} className={styles.reelHole} />
        ))}
        <circle cx="100" cy="36" r="3" fill={gradient} />
      </g>
      <path d="M8 14h14l12 62h96" className={styles.handle} stroke={gradient} />
      <path d="M26 44h124l-10 30H32z" className={styles.basket} stroke={gradient} />
      <path d="M58 46l2 26M86 46v26M114 46l-2 26M30 58h116" className={styles.basketGrid} />
      <circle cx="46" cy="90" r="7" className={styles.wheel} stroke={gradient} />
      <circle cx="122" cy="90" r="7" className={styles.wheel} stroke={gradient} />
    </svg>
  );
}

/** Compact cinema banner on top of the cart, in the look of the Skills page hero. */
export function CartKitBanner({ eyebrow, description, facts }: CartKitBannerProps): ReactElement {
  return (
    <div className={styles.banner}>
      <div className={styles.text}>
        <p className={`overline ${styles.eyebrow}`}>{eyebrow}</p>
        <p className={`body-sm ${styles.description}`}>{description}</p>
        {facts.length > 0 && (
          <ul className={styles.facts}>
            {facts.map((fact) => (
              <li key={fact} className={styles.fact}>
                {fact}
              </li>
            ))}
          </ul>
        )}
      </div>
      <CartKitArt />
    </div>
  );
}
