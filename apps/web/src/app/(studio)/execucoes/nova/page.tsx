import { EmptyState, buttonClassName, textLinkClassName, type Locale } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { AssetRefSchema, parseAssetRef, type TemplateDetails } from '@studio/shared/catalog';
import { RecipeRefSchema } from '@studio/shared/recipes';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import { NewRunForm } from '@/features/runs/components/NewRunForm';
import { templateRefOf, type TemplateDetailsByRef } from '@/features/runs/run-composition';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.runs.newRun.title };
}
export const dynamic = 'force-dynamic';

interface NewRunPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Draft and active versions both run (core `RecipeNotRunnableError` refuses deprecated only). */
async function loadRunnableRecipes(locale: Locale): Promise<RecipeVersionView[]> {
  const page = await serverStudioClient().listRecipes({ statuses: ['active', 'draft'], limit: 100 });
  return [...page.items].sort(
    (left, right) => left.recipe.name.localeCompare(right.recipe.name, locale) || right.recipe.version - left.recipe.version,
  );
}

/** Details of one pinned template; a version that is gone leaves the duration check to the api. */
async function loadTemplateDetails(ref: string): Promise<TemplateDetails | null> {
  const { assetId, version } = parseAssetRef(ref);
  try {
    const view = await serverStudioClient().getAssetVersion(assetId, version);
    return view.kind === 'template' ? view.details : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The templates the listed recipes pin (guided-creation spec section 3), read once each. */
async function loadPinnedTemplates(recipes: readonly RecipeVersionView[]): Promise<TemplateDetailsByRef> {
  const refs = [...new Set(recipes.map((view) => templateRefOf(view.recipe)).filter((ref): ref is string => ref !== null && AssetRefSchema.safeParse(ref).success))];
  const details = await Promise.all(refs.map(loadTemplateDetails));
  const byRef: Record<string, TemplateDetails> = {};
  refs.forEach((ref, index) => {
    const found = details[index];
    if (found !== null && found !== undefined) byRef[ref] = found;
  });
  return byRef;
}

/** design/telas/07: `/execucoes/nova?receita=<id>@<versão>`. */
export default async function NewRunPage({ searchParams }: NewRunPageProps) {
  const query = await searchParams;
  const { t, locale } = await getI18n();
  const recipes = await loadRunnableRecipes(locale);
  const templates = await loadPinnedTemplates(recipes);
  const requested = typeof query.receita === 'string' && RecipeRefSchema.safeParse(query.receita).success ? query.receita : null;
  const preselectedRef = recipes.some((view) => view.ref === requested) ? requested : null;

  return (
    <div className={layout.page}>
      <StudioHero
        variant="compact"
        eyebrow={t.common.heroEyebrows.runs}
        glyph="reel"
        back={
          <Link href="/execucoes" className={textLinkClassName()}>
            {t.runs.newRun.back}
          </Link>
        }
        title={t.runs.newRun.title}
        facts={recipes.length === 0 ? [] : [t.wizard.recipeCount(recipes.length)]}
      />
      {recipes.length === 0 ? (
        <EmptyState
          title={t.runs.newRun.noRecipesTitle}
          description={t.runs.newRun.noRecipesDescription}
          action={
            <Link href="/receitas/nova" className={buttonClassName({ variant: 'primary' })}>
              {t.runs.newRun.newRecipe}
            </Link>
          }
        />
      ) : (
        <NewRunForm recipes={recipes} preselectedRef={preselectedRef} templates={templates} />
      )}
    </div>
  );
}
