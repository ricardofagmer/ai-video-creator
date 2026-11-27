import { Alert, EmptyState, SearchField, buttonClassName, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { CatalogKindTabs } from '@/features/catalog/components/CatalogKindTabs';
import { listedAssetStatuses } from '@/features/catalog/discontinue-asset';
import layout from '@/features/common/layout.module.css';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';
import { SKILL_CATEGORY_PANEL_ID, type SkillCategory } from '../skill-categories';
import {
  SKILL_SEARCH_PARAM,
  newestSkillVersions,
  skillCategoryTabsOf,
  skillsBaseQuery,
  skillsHref,
  skillsMatching,
  skillsOfCategory,
} from '../skill-list';
import { loadRecentRunUsage } from '../skill-usage.server';
import styles from '../skills.module.css';
import { RememberSkillsLocation } from './RememberSkillsLocation';
import { SkillList } from './SkillList';

interface SkillsCatalogPanelProps {
  /** From `?categoria=`, already checked against the skill categories; null shows every skill. */
  category: SkillCategory | null;
  /** From `?salvo=`, already checked against the asset id rule; null otherwise. */
  savedAssetId: string | null;
  /** From `?busca=`, already trimmed and bounded; empty shows every skill. */
  search: string;
}

const SEARCH_FIELD_ID = 'busca-skills';

/**
 * Catalog -> AI & writing -> Skills (docs/specs/2026-11-23-skills-page-design.md): every catalog skill
 * under its category tab, each with an animated cover, its briefing, a real case and its run usage,
 * plus search, Import and New skill. It replaced the menu's separate Skills page, so the skills live
 * in one place.
 */
export async function SkillsCatalogPanel({ category, savedAssetId, search }: SkillsCatalogPanelProps): Promise<ReactElement> {
  const [page, usage, { t, locale }] = await Promise.all([
    serverStudioClient().searchAssets({ kinds: ['skill'], statuses: listedAssetStatuses, sensitivity: 'any', limit: 100 }),
    loadRecentRunUsage(),
    getI18n(),
  ]);
  const skills = newestSkillVersions(page.items);
  // Search first, then the tab, so every tab count reflects the current search.
  const found = skillsMatching(skills, search);
  const shown = skillsOfCategory(found, category);

  return (
    <div className={layout.stack}>
      <RememberSkillsLocation />
      <div className={styles.toolbar}>
        <form action="/catalogo" method="get" className={styles.searchForm}>
          <input type="hidden" name="secao" value={skillsBaseQuery.secao} />
          <input type="hidden" name="tipo" value={skillsBaseQuery.tipo} />
          {category !== null && <input type="hidden" name="categoria" value={category} />}
          <SearchField
            id={SEARCH_FIELD_ID}
            name={SKILL_SEARCH_PARAM}
            label={t.skills.list.searchLabel}
            placeholder={t.skills.list.searchPlaceholder}
            maxLength={200}
            defaultValue={search}
          />
          <button type="submit" className={buttonClassName({ variant: 'secondary' })}>
            {t.skills.list.searchSubmit}
          </button>
          {search !== '' && (
            <Link href={skillsHref(category)} className={textLinkClassName()}>
              {t.skills.list.searchClear}
            </Link>
          )}
        </form>
        <span className={styles.actions}>
          <Link href="/skills/novo?modo=importar" className={buttonClassName({ variant: 'primary' })}>
            {t.skills.list.importSkill}
          </Link>
          <Link href="/skills/novo?modo=criar" className={buttonClassName({ variant: 'secondary' })}>
            {t.skills.list.newSkill}
          </Link>
        </span>
      </div>
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
          tabs={skillCategoryTabsOf({ skills: found, selected: category, search, t: t.skills, locale })}
          panelId={SKILL_CATEGORY_PANEL_ID}
          appearance="segmented"
        >
          <div className={layout.stack}>
            <p className="caption" aria-live="polite">
              {t.skills.list.count(shown.length)}
            </p>
            {shown.length === 0 ? (
              <p>{search !== '' ? t.skills.list.searchEmpty : t.skills.list.categoryEmpty}</p>
            ) : (
              <SkillList skills={shown} usage={usage} t={t.skills} />
            )}
            {page.nextCursor !== null && <p className="caption">{t.skills.list.truncated}</p>}
          </div>
        </CatalogKindTabs>
      )}
    </div>
  );
}
