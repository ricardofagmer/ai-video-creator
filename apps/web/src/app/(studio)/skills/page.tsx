import { Alert, EmptyState, buttonClassName, textLinkClassName } from '@studio/ui';
import { AssetIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogKindTabs } from '@/features/catalog/components/CatalogKindTabs';
import layout from '@/features/common/layout.module.css';
import { SkillList } from '@/features/skills/components/SkillList';
import { SkillsHero } from '@/features/skills/components/SkillsHero';
import { SKILL_CATEGORY_PANEL_ID, countSkillCategories, skillCategoryFrom } from '@/features/skills/skill-categories';
import { newestSkillVersions, skillCategoryTabsOf, skillsOfCategory } from '@/features/skills/skill-list';
import styles from '@/features/skills/skills.module.css';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.skills.list.title };
}

interface SkillsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `/skills`: every catalog skill under its category tab, each with its briefing
 * (docs/specs/2026-11-23-skills-page-design.md). `?categoria=` and `?salvo=` are untrusted input.
 */
export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  const parameters = await searchParams;
  const category = skillCategoryFrom(singleValue(parameters.categoria));
  const saved = singleValue(parameters.salvo);
  const savedAssetId = saved !== undefined && AssetIdSchema.safeParse(saved).success ? saved : null;
  const [page, { t, locale }] = await Promise.all([
    serverStudioClient().searchAssets({ kinds: ['skill'], sensitivity: 'any', limit: 100 }),
    getI18n(),
  ]);
  const skills = newestSkillVersions(page.items);
  const shown = skillsOfCategory(skills, category);

  const actions = (
    <span className={styles.actions}>
      <Link href="/skills/novo?modo=importar" className={buttonClassName({ variant: 'primary' })}>
        {t.skills.list.importSkill}
      </Link>
      <Link href="/skills/novo?modo=criar" className={buttonClassName({ variant: 'secondary' })}>
        {t.skills.list.newSkill}
      </Link>
    </span>
  );

  const results = (
    <div className={layout.stack}>
      <p className="caption" aria-live="polite">
        {t.skills.list.count(shown.length)}
      </p>
      {shown.length === 0 ? <p>{t.skills.list.categoryEmpty}</p> : <SkillList skills={shown} t={t.skills} />}
      {page.nextCursor !== null && <p className="caption">{t.skills.list.truncated}</p>}
    </div>
  );

  return (
    <div className={layout.page}>
      <SkillsHero
        eyebrow={t.skills.list.heroEyebrow}
        title={t.skills.list.title}
        description={t.skills.list.description}
        facts={[t.skills.list.count(skills.length), t.skills.list.categoryCount(countSkillCategories(skills).size)]}
        actions={actions}
      />
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
          {results}
        </CatalogKindTabs>
      )}
    </div>
  );
}
