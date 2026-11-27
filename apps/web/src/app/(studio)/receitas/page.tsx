import { EmptyState, buttonClassName } from '@studio/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { RecipeList } from '@/features/recipes/components/RecipeList';
import { representativeRecipes } from '@/features/recipes/recipe-labels';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.recipes.list.title };
}

/** design/telas/05: `/receitas`, one card per recipe (its active version, else the newest). */
export default async function RecipesPage() {
  const page = await serverStudioClient().listRecipes({ limit: 100 });
  const { t, locale } = await getI18n();
  const texts = t.recipes.list;
  const recipes = representativeRecipes(page.items, locale);
  const activeCount = recipes.filter((view) => view.recipe.status === 'active').length;
  const newRecipeLink = (
    <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
      {texts.newRecipe}
    </Link>
  );

  return (
    <div className={layout.page}>
      <StudioHero
        eyebrow={t.common.heroEyebrows.recipes}
        glyph="script"
        title={texts.title}
        description={texts.description}
        facts={[texts.count(recipes.length), texts.activeCount(activeCount)]}
        actions={newRecipeLink}
      />
      {recipes.length === 0 ? (
        <EmptyState
          title={texts.emptyTitle}
          description={
            <>
              {texts.emptyDescriptionBefore}
              <span className="mono">studio catalog seed</span>
              {texts.emptyDescriptionAfter}
            </>
          }
          action={newRecipeLink}
        />
      ) : (
        <RecipeList recipes={recipes} />
      )}
    </div>
  );
}
