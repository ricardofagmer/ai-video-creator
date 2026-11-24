import type { Metadata } from 'next';
import { NewAssetView, loadNewVersionBase } from '@/features/catalog/views/NewAssetView';
import { getI18n } from '@/lib/i18n/server';

interface NewAssetPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: NewAssetPageProps): Promise<Metadata> {
  const query = await searchParams;
  const { t } = await getI18n();
  if (query.de === undefined) return { title: t.catalog.newAsset.title };
  const loaded = await loadNewVersionBase(query.de, query.versao);
  return { title: loaded === null ? t.catalog.newAsset.newVersionTitle : t.catalog.newAsset.newVersionTitleOf(loaded.base.name) };
}

/** design/telas/04 opened directly (a reload or a shared link); from the catalog it opens in the modal. */
export default async function NewAssetPage({ searchParams }: NewAssetPageProps) {
  return <NewAssetView query={await searchParams} presentation="page" />;
}
