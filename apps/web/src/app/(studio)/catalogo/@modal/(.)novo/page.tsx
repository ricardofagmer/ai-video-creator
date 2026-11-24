import { NewAssetModal } from '@/features/catalog/views/CatalogModalViews';

interface NewAssetModalPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewAssetModalPage({ searchParams }: NewAssetModalPageProps) {
  return <NewAssetModal query={await searchParams} />;
}
