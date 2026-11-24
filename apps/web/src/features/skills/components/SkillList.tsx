import { Badge, StatusBadge, textLinkClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { cartItemOf } from '@/features/cart/cart-item';
import { CartToggleButton } from '@/features/cart/components/CartToggleButton';
import layout from '@/features/common/layout.module.css';
import { type WebMessages } from '@/messages';
import { skillArtworkOf, type SkillTone } from '../skill-artwork';
import { skillCategoryOf } from '../skill-categories';
import { briefingPreview, skillDescriptionOf } from '../skill-metadata';
import styles from '../skills.module.css';
import { SkillGlyph } from './SkillGlyph';

interface SkillListProps {
  skills: readonly AssetVersionView[];
  t: WebMessages['skills'];
}

const toneClasses: Record<SkillTone, string | undefined> = {
  sunset: styles.toneSunset,
  flame: styles.toneFlame,
  magenta: styles.toneMagenta,
  violet: styles.toneViolet,
  dusk: styles.toneDusk,
};

function editHref(assetId: string): string {
  return `/skills/${encodeURIComponent(assetId)}/editar`;
}

function openHref(assetId: string): string {
  return `/catalogo/${encodeURIComponent(assetId)}`;
}

/**
 * One poster card per skill: a cover with the skill's media glyph, then name, category, status,
 * briefing (plain text, never Markdown), Edit and the cart. The whole card opens the skill.
 * The shared `Card` puts its header first, so a cover that reaches the card's edge needs this markup.
 */
function SkillCard({ skill, t }: { skill: AssetVersionView; t: WebMessages['skills'] }): ReactElement {
  const briefing = briefingPreview(skillDescriptionOf(skill));
  const artwork = skillArtworkOf(skill);
  return (
    <article className={`${styles.card} ${toneClasses[artwork.tone] ?? ''}`}>
      <div className={styles.cover} aria-hidden="true">
        <SkillGlyph name={artwork.glyph} className={styles.ghost} />
        <span className={styles.lens}>
          <SkillGlyph name={artwork.glyph} className={styles.lensGlyph} />
        </span>
      </div>
      <div className={styles.body}>
        <h3 className={`heading-3 ${styles.name}`}>
          <Link href={openHref(skill.id)} className={styles.cardLink}>
            {skill.name}
          </Link>
        </h3>
        <p className={styles.meta}>
          <Badge tone="info">{t.categories[skillCategoryOf(skill)]}</Badge>
          <StatusBadge kind="asset" status={skill.status} />
          <span className="caption">{t.list.version(skill.version)}</span>
        </p>
        {briefing === '' ? (
          <p className={styles.noBriefing}>
            {t.list.noBriefing}{' '}
            <Link href={editHref(skill.id)} className={`${textLinkClassName()} ${styles.aboveCardLink}`}>
              {t.list.addBriefing}
            </Link>
          </p>
        ) : (
          <p className={styles.briefing}>{briefing}</p>
        )}
        <div className={styles.links}>
          <Link href={editHref(skill.id)} className={textLinkClassName()}>
            {t.list.edit}
          </Link>
          <CartToggleButton item={cartItemOf(skill)} />
        </div>
      </div>
    </article>
  );
}

export function SkillList({ skills, t }: SkillListProps): ReactElement {
  return (
    <ul className={layout.cardGrid}>
      {skills.map((skill) => (
        <li key={skill.id}>
          <SkillCard skill={skill} t={t} />
        </li>
      ))}
    </ul>
  );
}
