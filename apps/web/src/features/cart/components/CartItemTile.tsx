'use client';

import { Badge, Button, Icon, textLinkClassName, type BadgeTone } from '@studio/ui';
import Link from 'next/link';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { SkillGlyph } from '@/features/skills/components/SkillGlyph';
import { type CartDestination } from '../cart-bindings';
import { cartKindArtwork } from '../cart-kind-artwork';
import { catalogHrefOf } from '../cart-item';
import { cartActions, type CartItem } from '../cart-store';
import styles from './CartItemTile.module.css';

type CartTag = 'recipe' | 'writer' | 'reference' | 'notActive' | 'unused';

const toneClasses = {
  sunset: styles.toneSunset,
  flame: styles.toneFlame,
  magenta: styles.toneMagenta,
  violet: styles.toneViolet,
  dusk: styles.toneDusk,
} as const;

const tagTones: Record<CartTag, BadgeTone> = {
  recipe: 'active',
  writer: 'info',
  reference: 'neutral',
  notActive: 'warning',
  unused: 'neutral',
};

/** The one word a tile shows about where its item goes; a version that is not active says so instead. */
function tagOf(item: CartItem, destination: CartDestination | undefined): CartTag | null {
  if (destination === 'slot') return 'recipe';
  if (destination === 'writer-skill') return 'writer';
  if (destination === 'unused') return 'unused';
  if (destination === 'reference') return item.status === 'active' ? 'reference' : 'notActive';
  return null;
}

interface CartItemTileProps {
  item: CartItem;
  destination: CartDestination | undefined;
  /** Closes the cart when the owner follows the link to the catalog page. */
  onNavigate: () => void;
}

/** One cart item as a compact poster tile: kind, name, where it goes and the remove button. */
export function CartItemTile({ item, destination, onNavigate }: CartItemTileProps): ReactElement {
  const t = useWebMessages();
  const texts = t.cart;
  const tag = tagOf(item, destination);
  const artwork = cartKindArtwork[item.kind];
  const hints: Record<CartTag, string> = {
    recipe: texts.destinationHints.slot,
    writer: texts.skill,
    reference: texts.destinationHints.reference,
    notActive: texts.notActive,
    unused: item.sensitivity === 'biometric' ? texts.biometric : texts.destinationHints.unused,
  };
  return (
    <li className={`${styles.tile} ${toneClasses[artwork.tone]}`}>
      <div className={styles.head}>
        <span className={styles.lens} aria-hidden="true">
          <SkillGlyph name={artwork.glyph} className={styles.lensGlyph} />
        </span>
        <span className={`overline ${styles.kind}`}>{t.catalog.kinds[item.kind]}</span>
      </div>
      <Link href={catalogHrefOf(item.ref)} onClick={onNavigate} title={item.name} className={textLinkClassName(styles.name)}>
        {item.name}
      </Link>
      <div className={styles.foot}>
        {tag !== null && (
          <span className={styles.tag} title={hints[tag]}>
            <Badge tone={tagTones[tag]} className={styles.tagBadge}>
              {texts.tags[tag]}
            </Badge>
            <span className="visually-hidden">{hints[tag]}</span>
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={styles.remove}
          onClick={() => cartActions.remove(item.ref)}
          aria-label={texts.removeHidden(item.name)}
          title={texts.removeHidden(item.name)}
        >
          <Icon name="trash" size="sm" />
        </Button>
      </div>
    </li>
  );
}
