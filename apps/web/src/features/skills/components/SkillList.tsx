import { Badge, StatusBadge, textLinkClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { cartItemOf } from '@/features/cart/cart-item';
import { CartToggleButton } from '@/features/cart/components/CartToggleButton';
import { PosterCard } from '@/features/common/components/PosterCard';
import poster from '@/features/common/poster-card.module.css';
import { type WebMessages } from '@/messages';
import { skillArtworkOf } from '../skill-artwork';
import { ownSkillTags, skillCategoryOf } from '../skill-categories';
import { groupSkillsByTags } from '../skill-list';
import { briefingPreview, skillDescriptionOf } from '../skill-metadata';
import styles from '../skills.module.css';

interface SkillListProps {
  skills: readonly AssetVersionView[];
  t: WebMessages['skills'];
}

function editHref(assetId: string): string {
  return `/skills/${encodeURIComponent(assetId)}/editar`;
}

function openHref(assetId: string): string {
  return `/catalogo/${encodeURIComponent(assetId)}`;
}

/**
 * One poster card per skill: name, category, status, tags, briefing (plain text, never Markdown), Edit
 * and the cart. The whole card opens the skill.
 */
function SkillCard({ skill, t }: { skill: AssetVersionView; t: WebMessages['skills'] }): ReactElement {
  const briefing = briefingPreview(skillDescriptionOf(skill));
  // Category tags already show as the coloured badge above.
  const tags = ownSkillTags(skill.tags);
  return (
    <PosterCard artwork={skillArtworkOf(skill)}>
      <h3 className={`heading-3 ${poster.name}`}>
        <Link href={openHref(skill.id)} className={poster.cardLink}>
          {skill.name}
        </Link>
      </h3>
      <p className={poster.meta}>
        <Badge tone="info">{t.categories[skillCategoryOf(skill)]}</Badge>
        <StatusBadge kind="asset" status={skill.status} />
        <span className="caption">{t.list.version(skill.version)}</span>
      </p>
      {tags.length > 0 && (
        <ul className={styles.tags} aria-label={t.list.tags}>
          {tags.map((tag) => (
            <li key={tag}>
              <Badge tone="neutral">{tag}</Badge>
            </li>
          ))}
        </ul>
      )}
      {briefing === '' ? (
        <p className={styles.noBriefing}>
          {t.list.noBriefing}{' '}
          <Link href={editHref(skill.id)} className={`${textLinkClassName()} ${poster.aboveCardLink}`}>
            {t.list.addBriefing}
          </Link>
        </p>
      ) : (
        <p className={styles.briefing}>{briefing}</p>
      )}
      <div className={poster.links}>
        <Link href={editHref(skill.id)} className={textLinkClassName()}>
          {t.list.edit}
        </Link>
        <CartToggleButton item={cartItemOf(skill)} />
      </div>
    </PosterCard>
  );
}

/** The skills of the selected category, one titled section per set of tags. */
export function SkillList({ skills, t }: SkillListProps): ReactElement {
  return (
    <div className={styles.tagGroups}>
      {groupSkillsByTags(skills).map((group) => (
        <section key={group.key} className={styles.tagGroup} aria-label={group.tags.length > 0 ? group.tags.join(', ') : t.list.untagged}>
          <h2 className={styles.tagGroupTitle}>
            {group.tags.length > 0 ? (
              group.tags.map((tag) => (
                <Badge key={tag} tone="neutral">
                  {tag}
                </Badge>
              ))
            ) : (
              <span>{t.list.untagged}</span>
            )}
            <span className="caption">{t.list.count(group.skills.length)}</span>
          </h2>
          <ul className={styles.compactGrid}>
            {group.skills.map((skill) => (
              <li key={skill.id}>
                <SkillCard skill={skill} t={t} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
