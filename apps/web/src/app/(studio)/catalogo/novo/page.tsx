import { EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { AssetIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AssetForm } from '@/features/catalog/asset-form/AssetForm';
import layout from '@/features/common/layout.module.css';
import { isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';

type QueryValue = string | string[] | undefined;

interface NewAssetPageProps {
  searchParams: Promise<Record<string, QueryValue>>;
}

interface NewVersionBase {
  base: AssetVersionView;
  nextVersion: number;
}

/** `?de=<assetId>&versao=<N>`: version N (else the newest) and the number the new version gets. */
async function loadBase(assetId: QueryValue, requested: QueryValue): Promise<NewVersionBase | null> {
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

export async function generateMetadata({ searchParams }: NewAssetPageProps): Promise<Metadata> {
  const query = await searchParams;
  if (query.de === undefined) return { title: 'Enviar ativo' };
  const loaded = await loadBase(query.de, query.versao);
  return { title: loaded === null ? 'Nova versão' : `Nova versão · ${loaded.base.name}` };
}

const backToCatalog = (
  <Link href="/catalogo" className={textLinkClassName()}>
    ← Catálogo
  </Link>
);

/** design/telas/04: `/catalogo/novo` (new asset) and `/catalogo/novo?de=<assetId>` (version N+1). */
export default async function NewAssetPage({ searchParams }: NewAssetPageProps) {
  const query = await searchParams;

  if (query.de === undefined) {
    return (
      <div className={layout.page}>
        <PageHeader back={backToCatalog} title="Enviar ativo" description="O ativo é salvo como rascunho, versão 1." />
        <AssetForm target={{ type: 'new' }} base={null} nextVersion={1} cancelHref="/catalogo" />
      </div>
    );
  }

  const loaded = await loadBase(query.de, query.versao);
  if (loaded === null) {
    return (
      <EmptyState
        title="Ativo não encontrado"
        description="Ele pode ter sido digitado errado no endereço."
        action={
          <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
            Voltar ao catálogo
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
          <Link href={assetHref} className={textLinkClassName()}>
            ← {base.name}
          </Link>
        }
        title={`Nova versão de ${base.name}`}
        description={`A versão ${base.version} continua igual; esta será a versão ${nextVersion}.`}
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
