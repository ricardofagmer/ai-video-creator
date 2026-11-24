import { AssetDetailModal, NewAssetModal } from '@/features/catalog/views/CatalogModalViews';

interface SkillAssetModalProps {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `/catalogo/novo` (a new version from the details) also lands here: `novo` is never an asset id. */
const NEW_ASSET_SEGMENT = 'novo';

/** A skill card's catalog details (and its new-version form) opened from the Skills list, in a modal over it. */
export default async function SkillAssetModal({ params, searchParams }: SkillAssetModalProps) {
  const { assetId } = await params;
  const query = await searchParams;
  return assetId === NEW_ASSET_SEGMENT ? (
    <NewAssetModal query={query} returnTo="skills" />
  ) : (
    <AssetDetailModal assetId={assetId} query={query} returnTo="skills" />
  );
}
