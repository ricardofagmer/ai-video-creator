import { Alert, EmptyState, buttonClassName, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { CatalogKindTabs } from '@/features/catalog/components/CatalogKindTabs';
import layout from '@/features/common/layout.module.css';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';
import { SKILL_CATEGORY_PANEL_ID, type SkillCategory } from '../skill-categories';
import { newestSkillVersions, skillCategoryTabsOf, skillsOfCategory } from '../skill-list';
import styles from '../skills.module.css';
import { RememberSkillsLocation } from './RememberSkillsLocation';
import { SkillList } from './SkillList';

interface SkillsCatalogPanelProps {
  /** From `?categoria=`, already checked against the skill categories; null shows every skill. */
  category: SkillCategory | null;
  /** From `?salvo=`, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
}

/**
 * Catalog -> AI & writing -> Skills (docs/specs/2026-11-23-skills-page-design.md): every catalog skill
 * under its category tab, each with its briefing, plus Import and New skill. It replaced the menu's
 * separate Skills page, so the skills live in one place.
 */
export async function SkillsCatalogPanel({ category, savedAssetId }: SkillsCatalogPanelProps): Promise<ReactElement> {
  const [page, { t, locale }] = await Promise.all([
    serverStudioClient().searchAssets({ kinds: ['skill'], sensitivity: 'any', limit: 100 }),
    getI18n(),
  ]);
  const skills = newestSkillVersions(page.items);
  const shown = skillsOfCategory(skills, category);

  return (
    <div className={layout.stack}>
      <RememberSkillsLocation />
      <span className={styles.actions}>
        <Link href="/skills/novo?modo=importar" className={buttonClassName({ variant: 'primary' })}>
          {t.skills.list.importSkill}
        </Link>
        <Link href="/skills/novo?modo=criar" className={buttonClassName({ variant: 'secondary' })}>
          {t.skills.list.newSkill}
        </Link>
      </span>
      {savedAssetId !== null && (
        <Alert variant="success">
          {t.skills.list.savedNotice}{' '}
          <Link href={`/catalogo/${encodeURIComponent(savedAssetId)}`} className={textLinkClassName()}>
            {t.skills.list.openSaved}
          </Link>
        </Alert>
      )}
      {skills.length === 0 ? (
        <EmptyState
          title={t.skills.list.emptyTitle}
          description={t.skills.list.emptyDescription}
          action={
            <Link href="/skills/novo?modo=importar" className={buttonClassName({ variant: 'primary' })}>
              {t.skills.list.importSkill}
            </Link>
          }
        />
      ) : (
        <CatalogKindTabs
          label={t.skills.list.categoriesLabel}
          tabs={skillCategoryTabsOf({ skills, selected: category, t: t.skills, locale })}
          panelId={SKILL_CATEGORY_PANEL_ID}
          appearance="segmented"
        >
          <div className={layout.stack}>
            <p className="caption" aria-live="polite">
              {t.skills.list.count(shown.length)}
            </p>
            {shown.length === 0 ? <p>{t.skills.list.categoryEmpty}</p> : <SkillList skills={shown} t={t.skills} />}
            {page.nextCursor !== null && <p className="caption">{t.skills.list.truncated}</p>}
          </div>
        </CatalogKindTabs>
      )}
    </div>
  );
}
