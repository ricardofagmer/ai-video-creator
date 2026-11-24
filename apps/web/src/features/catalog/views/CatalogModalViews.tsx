import type { ReactElement } from 'react';
import { CatalogModal, type ModalReturnScope } from '@/features/catalog/components/CatalogModal';
import { getI18n } from '@/lib/i18n/server';
import { AssetDetailView } from './AssetDetailView';
import { NewAssetView } from './NewAssetView';

type Query = Record<string, string | string[] | undefined>;

interface CatalogModalViewProps {
  query: Query;
  /** The list the modal was opened from; defaults to the catalog. */
  returnTo?: ModalReturnScope;
}

async function modalLabels(returnTo: ModalReturnScope): Promise<{ closeLabel: string; backLabel: string; t: Awaited<ReturnType<typeof getI18n>>['t'] }> {
  const { t } = await getI18n();
  const backLabel = returnTo === 'skills' ? t.skills.newPage.backToList : t.catalog.asset.backToCatalog;
  return { closeLabel: t.catalog.asset.closeModal, backLabel, t };
}

/** `/catalogo/[assetId]` reached from a list: the same details, in a modal over it. */
export async function AssetDetailModal({ assetId, query, returnTo = 'catalog' }: CatalogModalViewProps & { assetId: string }): Promise<ReactElement> {
  const { t, closeLabel, backLabel } = await modalLabels(returnTo);
  return (
    <CatalogModal title={t.catalog.asset.modalDetailsTitle} closeLabel={closeLabel} backLabel={backLabel} returnTo={returnTo}>
      <AssetDetailView assetId={assetId} query={query} presentation="modal" />
    </CatalogModal>
  );
}

/** `/catalogo/novo` reached from a list: the asset form (new asset or new version) in a modal. */
export async function NewAssetModal({ query, returnTo = 'catalog' }: CatalogModalViewProps): Promise<ReactElement> {
  const { t, closeLabel, backLabel } = await modalLabels(returnTo);
  const title = query.de === undefined ? t.catalog.asset.modalNewTitle : t.catalog.asset.modalEditTitle;
  return (
    <CatalogModal title={title} closeLabel={closeLabel} backLabel={backLabel} returnTo={returnTo}>
      <NewAssetView query={query} presentation="modal" />
    </CatalogModal>
  );
}
