import { Alert, Card, DescriptionList, Table, shortenHash, type TableColumn } from '@studio/ui';
import { type RunManifest } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { sensitivityLabels } from '@/features/catalog/catalog-labels';
import { languageLabels } from '@/features/recipes/recipe-labels';
import { type ArtifactRead } from '../media-safety';

interface ReviewManifestCardProps {
  manifest: ArtifactRead<RunManifest>;
}

type BoundAsset = RunManifest['assets'][number];
type PinnedReference = RunManifest['references'][number];

function hashCell(contentHash: string): ReactElement {
  return (
    <span className="mono" title={contentHash}>
      {shortenHash(contentHash)}
    </span>
  );
}

const assetColumns: readonly TableColumn<BoundAsset>[] = [
  { key: 'slot', header: 'Slot', rowHeader: true, render: (asset) => <span className="mono">{asset.slot}</span> },
  { key: 'ref', header: 'Ativo', render: (asset) => <span className="mono">{asset.ref}</span> },
  { key: 'hash', header: 'Hash', render: (asset) => hashCell(asset.contentHash) },
  { key: 'sensitivity', header: 'Sensibilidade', render: (asset) => sensitivityLabels[asset.sensitivity] },
];

const referenceColumns: readonly TableColumn<PinnedReference>[] = [
  { key: 'ref', header: 'Ativo', rowHeader: true, render: (reference) => <span className="mono">{reference.ref}</span> },
  { key: 'hash', header: 'Hash', render: (reference) => hashCell(reference.contentHash) },
];

/**
 * Card "Manifesto" (design/telas/09, PRD 7.4): recipe pin, parameters, models and every bound
 * asset with its hash. Refs and hashes only; nothing here loads asset bytes.
 */
export function ReviewManifestCard({ manifest }: ReviewManifestCardProps): ReactElement {
  if (manifest.status !== 'present') {
    return (
      <Card title="Manifesto">
        <Alert variant="warning">
          {manifest.status === 'absent' ? 'O manifesto (manifest.json) não foi encontrado.' : 'O manifesto (manifest.json) não pôde ser lido.'}
        </Alert>
      </Card>
    );
  }
  const { recipe, parameters, models, assets, references } = manifest.value;
  const brief = parameters.brief;
  return (
    <Card title="Manifesto">
      <div className={layout.stack}>
        <DescriptionList
          items={[
            { term: 'Receita', description: `${recipe.ref} · ${shortenHash(recipe.contentHash)}`, mono: true },
            {
              term: 'Parâmetros',
              description: `${brief.topic} · ${brief.format} · ${brief.targetDurationSec} s · ${languageLabels[brief.language]}`,
            },
            {
              term: 'Modelos',
              description: models.length === 0 ? '—' : models.map((model) => `${model.role}: ${model.modelId}`).join(' · '),
              mono: true,
            },
          ]}
        />
        <Table caption="Ativos usados" columns={assetColumns} rows={assets} rowKey={(asset) => `${asset.slot}-${asset.ref}`} emptyText="Nenhum ativo fixado." />
        {references.length > 0 && (
          <Table
            caption="Referências desta execução"
            columns={referenceColumns}
            rows={references}
            rowKey={(reference) => reference.ref}
            emptyText="Nenhuma referência."
          />
        )}
      </div>
    </Card>
  );
}
