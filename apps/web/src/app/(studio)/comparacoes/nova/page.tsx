import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { ComparisonForm } from '@/features/comparisons/components/ComparisonForm';
import { serverStudioClient } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Nova comparação' };
export const dynamic = 'force-dynamic';

/** Draft and active versions both run; a deprecated version cannot start a run. */
async function loadRunnableRecipes(): Promise<RecipeVersionView[]> {
  const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
  return [...page.items].sort(
    (left, right) => left.recipe.name.localeCompare(right.recipe.name, 'pt-BR') || right.recipe.version - left.recipe.version,
  );
}

/** SPEC 0003 section 5.3: `/comparacoes/nova`. */
export default async function NewComparisonPage() {
  const recipes = await loadRunnableRecipes();

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/comparacoes" className={textLinkClassName()}>
            ← Comparações
          </Link>
        }
        title="Nova comparação"
      />
      {recipes.length === 0 ? (
        <EmptyState
          title="Nenhuma receita ainda"
          description="Crie uma receita antes de comparar versões."
          action={
            <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
              Nova receita
            </Link>
          }
        />
      ) : (
        <ComparisonForm recipes={recipes} />
      )}
    </div>
  );
}
