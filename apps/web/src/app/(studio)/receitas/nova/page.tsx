import { PageHeader, textLinkClassName } from '@studio/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { loadBindingOptions } from '@/features/recipes/binding-options.server';
import { RecipeEditor } from '@/features/recipes/components/RecipeEditor';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.recipes.newRecipe.title };
}

/** design/telas/06: `/receitas/nova`, a recipe built from active catalog versions. */
export default async function NewRecipePage() {
  const options = await loadBindingOptions([]);
  const { t } = await getI18n();
  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/receitas" className={textLinkClassName()}>
            {t.recipes.detail.back}
          </Link>
        }
        title={t.recipes.newRecipe.title}
        description={t.recipes.newRecipe.description}
      />
      <RecipeEditor base={null} options={options} wizard />
    </div>
  );
}
