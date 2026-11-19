import { PageHeader, textLinkClassName } from '@studio/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { loadBindingOptions } from '@/features/recipes/binding-options.server';
import { RecipeEditor } from '@/features/recipes/components/RecipeEditor';

export const metadata: Metadata = { title: 'Nova receita' };

/** design/telas/06: `/receitas/nova`, a recipe built from active catalog versions. */
export default async function NewRecipePage() {
  const options = await loadBindingOptions([]);
  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/receitas" className={textLinkClassName()}>
            ← Receitas
          </Link>
        }
        title="Nova receita"
        description="A receita é salva como rascunho, versão 1."
      />
      <RecipeEditor base={null} options={options} />
    </div>
  );
}
