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
import { SKILL_CASE_RUN_ID, skillCaseIdOf } from '../skill-cases';
import { ownSkillTags, skillCategoryOf } from '../skill-categories';
import { groupSkillsByTags } from '../skill-list';
import { briefingPreview, skillDescriptionOf } from '../skill-metadata';
import { skillStageOf } from '../skill-stage';
import { type AssetRunUsage } from '../skill-usage.server';
import styles from '../skills.module.css';
import { SkillStage } from './SkillStage';

type SkillTexts = WebMessages['skills'];
/** Run usage per skill id; null when it could not be read, so the cards leave the line out. */
type SkillUsage = ReadonlyMap<string, AssetRunUsage> | null;

interface SkillListProps {
  skills: readonly AssetVersionView[];
  usage: SkillUsage;
  t: SkillTexts;
}

function editHref(assetId: string): string {
  return `/skills/${encodeURIComponent(assetId)}/editar`;
}

function openHref(assetId: string): string {
  return `/catalogo/${encodeURIComponent(assetId)}`;
}

function runHref(runId: string): string {
  return `/execucoes/${encodeURIComponent(runId)}`;
}

/** How the skill works, told by one recorded run: what was asked, what the skill did, what came out. */
function SkillCase({ assetId, t }: { assetId: string; t: SkillTexts }): ReactElement {
  const caseId = skillCaseIdOf(assetId);
  if (caseId === null) return <p className={styles.caseNone}>{t.cases.none}</p>;
  const texts = t.cases.items[caseId];
  return (
    <section className={styles.case} aria-label={t.cases.label}>
      <p className={styles.caseLabel}>{t.cases.label}</p>
      <p className={styles.caseRequest}>{texts.request}</p>
      <ol className={styles.caseSteps}>
        {texts.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className={styles.caseResult}>{texts.result}</p>
      <p className={styles.caseSource}>{t.cases.source(SKILL_CASE_RUN_ID)}</p>
    </section>
  );
}

/** Studio runs that used the skill: the count and a link to the newest one. */
function SkillRuns({ assetId, usage, t }: { assetId: string; usage: SkillUsage; t: SkillTexts }): ReactElement | null {
  if (usage === null) return null;
  const runs = usage.get(assetId);
  if (runs === undefined) return <p className={styles.usage}>{t.usage.none}</p>;
  return (
    <p className={styles.usage}>
      {t.usage.runs(runs.runCount)}. {t.usage.latest}{' '}
      <Link href={runHref(runs.latest.runId)} className={`${textLinkClassName()} ${poster.aboveCardLink}`}>
        {runs.latest.title}
      </Link>
    </p>
  );
}

/**
 * One poster card per skill: an animated cover, name, category, status, tags, briefing (plain text,
 * never Markdown), a real case, its run usage, Edit and the cart. The whole card opens the skill.
 */
function SkillCard({ skill, usage, t }: { skill: AssetVersionView; usage: SkillUsage; t: SkillTexts }): ReactElement {
  const briefing = briefingPreview(skillDescriptionOf(skill));
  // Category tags already show as the coloured badge above.
  const tags = ownSkillTags(skill.tags);
  const artwork = skillArtworkOf(skill);
  return (
    <PosterCard artwork={artwork} media={<SkillStage kind={skillStageOf(skill)} />}>
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
      <SkillCase assetId={skill.id} t={t} />
      <SkillRuns assetId={skill.id} usage={usage} t={t} />
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
export function SkillList({ skills, usage, t }: SkillListProps): ReactElement {
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
                <SkillCard skill={skill} usage={usage} t={t} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
