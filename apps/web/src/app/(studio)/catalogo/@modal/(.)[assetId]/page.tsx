import { AssetDetailModal, NewAssetModal } from '@/features/catalog/views/CatalogModalViews';

interface AssetModalProps {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Static `novo` is a route of its own, never an asset id; Next can match this dynamic interception before the static `(.)novo` one. */
const NEW_ASSET_SEGMENT = 'novo';

export default async function AssetModal({ params, searchParams }: AssetModalProps) {
  const { assetId } = await params;
  const query = await searchParams;
  return assetId === NEW_ASSET_SEGMENT ? <NewAssetModal query={query} /> : <AssetDetailModal assetId={assetId} query={query} />;
}
