import { Alert, Card, EmptyState, PageHeader, StatusBadge, buttonClassName, textLinkClassName } from '@studio/ui';
import { type RecipeVersionView } from '@studio/shared/api';
import { ComparisonIdSchema } from '@studio/shared/catalog';
import { RecipeIdSchema } from '@studio/shared/recipes';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FocusHeadingOnVersionChange } from '@/features/catalog/components/FocusHeadingOnVersionChange';
import layout from '@/features/common/layout.module.css';
import { SubjectCurationsCard } from '@/features/curations/components/SubjectCurationsCard';
import { curationBlockedText, recipeCurationSubject } from '@/features/curations/curation-subject';
import { ActivationSummary } from '@/features/promotion/components/ActivationSummary';
import { loadBindingOptions } from '@/features/recipes/binding-options.server';
import { RecipeEditor } from '@/features/recipes/components/RecipeEditor';
import { RecipeStatusControls, RecipeStatusNotice } from '@/features/recipes/components/RecipeStatusControls';
import { RecipeVersionSelect } from '@/features/recipes/components/RecipeVersionSelect';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

interface RecipePageProps {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Every version of the recipe, newest first; null when the id is unknown or malformed. */
async function loadVersions(recipeId: string): Promise<RecipeVersionView[] | null> {
  if (!RecipeIdSchema.safeParse(recipeId).success) return null;
  try {
    const page = await serverStudioClient().listRecipes({ recipeId, limit: 100 });
    const versions = [...page.items].sort((left, right) => right.recipe.version - left.recipe.version);
    return versions.length === 0 ? null : versions;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** `?versao=N`, else the active version, else the newest. */
function openVersion(versions: readonly RecipeVersionView[], requested: string | string[] | undefined): RecipeVersionView | undefined {
  const number = typeof requested === 'string' && /^[1-9][0-9]{0,6}$/.test(requested) ? Number.parseInt(requested, 10) : null;
  return (
    versions.find((view) => view.recipe.version === number) ?? versions.find((view) => view.recipe.status === 'active') ?? versions[0]
  );
}

export async function generateMetadata({ params }: RecipePageProps): Promise<Metadata> {
  const { recipeId } = await params;
  const versions = await loadVersions(recipeId);
  const name = versions?.[0]?.recipe.name;
  const { t } = await getI18n();
  return { title: name === undefined ? t.recipes.list.title : t.recipes.detail.titleOf(name) };
}

/** design/telas/06: `/receitas/[recipeId]`, version N in the editor; saving makes N+1. */
export default async function RecipePage({ params, searchParams }: RecipePageProps) {
  const { recipeId } = await params;
  const query = await searchParams;
  const versions = await loadVersions(recipeId);
  const current = versions === null ? undefined : openVersion(versions, query.versao);
  const { t, ui } = await getI18n();
  const texts = t.recipes.detail;

  if (versions === null || current === undefined) {
    return (
      <EmptyState
        title={texts.notFoundTitle}
        description={texts.notFoundDescription}
        action={
          <Link href="/receitas" className={buttonClassName({ variant: 'secondary' })}>
            {texts.backToList}
          </Link>
        }
      />
    );
  }

  const { recipe } = current;
  const nextVersion = (versions[0]?.recipe.version ?? recipe.version) + 1;
  const options = await loadBindingOptions(recipe.bindings);
  // `?comparacao=` from a comparison page: offered as optional evidence in the promotion dialog.
  const comparison = ComparisonIdSchema.safeParse(typeof query.comparacao === 'string' ? query.comparacao : '');

  return (
    <div className={layout.page}>
      <FocusHeadingOnVersionChange version={recipe.version} />
      <PageHeader
        back={
          <Link href="/receitas" className={textLinkClassName()}>
            {texts.back}
          </Link>
        }
        title={recipe.name}
        meta={
          <>
            <StatusBadge kind="asset" status={recipe.status} />
            <span className="mono">v{recipe.version}</span>
          </>
        }
        description={<span className="mono">{current.ref}</span>}
        actions={
          <>
            <RecipeVersionSelect
              recipeId={recipe.id}
              label={texts.versionsLabel}
              openLabel={texts.open}
              current={recipe.version}
              versions={versions.map((view) => ({
                version: view.recipe.version,
                label: `v${view.recipe.version} · ${ui.status.asset[view.recipe.status]}`,
              }))}
            />
            <Link href={`/execucoes/nova?receita=${current.ref}`} className={buttonClassName({ variant: 'secondary' })}>
              {texts.run}
            </Link>
            <RecipeStatusControls
              recipeId={recipe.id}
              version={recipe.version}
              status={recipe.status}
              evidenceComparisonId={comparison.success ? comparison.data : null}
            />
          </>
        }
      />
      {query.aviso === 'salvo' && <Alert variant="success">{texts.saved(recipe.version)}</Alert>}
      <RecipeStatusNotice notice={query.aviso} version={recipe.version} />
      {current.activation !== null && (
        <Card title={texts.activationTitle}>
          <ActivationSummary approval={current.activation} showScore={false} />
        </Card>
      )}
      {recipe.status === 'active' && current.activation === null && (
        <Alert variant="info">{texts.activatedWithoutApproval}</Alert>
      )}
      <SubjectCurationsCard
        subject={recipeCurationSubject(current)}
        blockedText={curationBlockedText({ status: recipe.status, biometric: false }, t.curations.blocked)}
      />
      <RecipeEditor
        key={current.ref}
        base={{ recipeId: recipe.id, version: recipe.version, nextVersion, definition: recipe }}
        options={options}
      />
    </div>
  );
}
