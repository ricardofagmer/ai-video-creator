import { EmptyState, PageHeader, buttonClassName, textLinkClassName, type Locale } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { ComparisonForm } from '@/features/comparisons/components/ComparisonForm';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.curations.comparisons.new.title };
}
export const dynamic = 'force-dynamic';

/** Draft and active versions both run; a deprecated version cannot start a run. */
async function loadRunnableRecipes(locale: Locale): Promise<RecipeVersionView[]> {
  const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
  return [...page.items].sort(
    (left, right) => left.recipe.name.localeCompare(right.recipe.name, locale) || right.recipe.version - left.recipe.version,
  );
}

/** SPEC 0003 section 5.3: `/comparacoes/nova`. */
export default async function NewComparisonPage() {
  const { t, locale } = await getI18n();
  const texts = t.curations.comparisons.new;
  const recipes = await loadRunnableRecipes(locale);

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/comparacoes" className={textLinkClassName()}>
            {texts.back}
          </Link>
        }
        title={texts.title}
      />
      {recipes.length === 0 ? (
        <EmptyState
          title={texts.noRecipesTitle}
          description={texts.noRecipesDescription}
          action={
            <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
              {texts.newRecipe}
            </Link>
          }
        />
      ) : (
        <ComparisonForm recipes={recipes} />
      )}
    </div>
  );
}
