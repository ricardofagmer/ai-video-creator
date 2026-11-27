import type { Metadata } from 'next';
import { AssetDetailView, loadAssetVersions } from '@/features/catalog/views/AssetDetailView';
import { getI18n } from '@/lib/i18n/server';

interface AssetPageProps {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: AssetPageProps): Promise<Metadata> {
  const { assetId } = await params;
  const versions = await loadAssetVersions(assetId);
  const name = versions?.[0]?.name;
  const { t } = await getI18n();
  return { title: name === undefined ? t.catalog.list.title : t.catalog.asset.titleOf(name) };
}

/** design/telas/03 opened directly (a reload or a shared link); from the catalog it opens in the modal. */
export default async function AssetPage({ params, searchParams }: AssetPageProps) {
  const { assetId } = await params;
  return <AssetDetailView assetId={assetId} query={await searchParams} presentation="page" />;
}
