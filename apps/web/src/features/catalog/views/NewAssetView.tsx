import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { AssetIdSchema, AssetKindSchema, type AssetKind } from '@studio/shared/catalog';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { AssetForm } from '@/features/catalog/asset-form/AssetForm';
import layout from '@/features/common/layout.module.css';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { getI18n } from '@/lib/i18n/server';

import { type CatalogPresentation } from './AssetDetailView';

type QueryValue = string | string[] | undefined;

interface NewAssetViewProps {
  query: Record<string, QueryValue>;
  /** `modal` renders inside the catalog's dialog, which already offers the way back. */
  presentation: CatalogPresentation;
}

interface NewVersionBase {
  base: AssetVersionView;
  nextVersion: number;
}

/** `?de=<assetId>&versao=<N>`: version N (else the newest) and the number the new version gets. */
export async function loadNewVersionBase(assetId: QueryValue, requested: QueryValue): Promise<NewVersionBase | null> {
  if (typeof assetId !== 'string' || !AssetIdSchema.safeParse(assetId).success) return null;
  try {
    const page = await serverStudioClient().listAssetVersions(assetId, { limit: 100 });
    const versions = [...page.items].sort((left, right) => right.version - left.version);
    const number = typeof requested === 'string' && /^[1-9][0-9]{0,6}$/.test(requested) ? Number.parseInt(requested, 10) : null;
    const base = versions.find((version) => version.version === number) ?? versions[0];
    const newest = versions[0];
    return base === undefined || newest === undefined ? null : { base, nextVersion: newest.version + 1 };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** design/telas/04: `/catalogo/novo` (new asset) and `/catalogo/novo?de=<assetId>` (version N+1). */
export async function NewAssetView({ query, presentation }: NewAssetViewProps): Promise<ReactElement> {
  const { t } = await getI18n();
  const inPage = presentation === 'page';
  const backToCatalog = inPage ? (
    <Link href="/catalogo" className={textLinkClassName()}>
      {t.catalog.asset.back}
    </Link>
  ) : undefined;

  if (query.de === undefined) {
    // `?tipo=<kind>` presets the kind, e.g. the Images section's "Upload an image file"; untrusted, so parsed.
    const parsedKind = AssetKindSchema.safeParse(query.tipo);
    const initialKind: AssetKind | undefined = parsedKind.success ? parsedKind.data : undefined;
    return (
      <div className={layout.page}>
        <PageHeader back={backToCatalog} title={t.catalog.newAsset.title} description={t.catalog.newAsset.description} />
        <AssetForm target={{ type: 'new' }} base={null} nextVersion={1} cancelHref="/catalogo" initialKind={initialKind} />
      </div>
    );
  }

  const loaded = await loadNewVersionBase(query.de, query.versao);
  if (loaded === null) {
    return (
      <EmptyState
        title={t.catalog.asset.notFoundTitle}
        description={t.catalog.asset.notFoundDescription}
        action={
          <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
            {t.catalog.asset.backToCatalog}
          </Link>
        }
      />
    );
  }

  const { base, nextVersion } = loaded;
  const assetHref = `/catalogo/${base.id}?versao=${base.version}`;
  return (
    <div className={layout.page}>
      <PageHeader
        back={
          inPage ? (
            <Link href={assetHref} className={textLinkClassName()}>
              ← {base.name}
            </Link>
          ) : undefined
        }
        title={t.catalog.newAsset.newVersionHeading(base.name)}
        description={t.catalog.newAsset.newVersionDescription(base.version, nextVersion)}
      />
      <AssetForm
        key={`${base.id}@${base.version}`}
        target={{ type: 'new-version', assetId: base.id, baseVersion: base.version }}
        base={base}
        nextVersion={nextVersion}
        cancelHref={assetHref}
      />
    </div>
  );
}
