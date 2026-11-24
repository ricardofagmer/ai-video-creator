import { Alert, Card, DescriptionList, Table, shortenHash, type TableColumn, type UiMessages } from '@studio/ui';
import { type RunManifest } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { languageLabels } from '@/features/recipes/recipe-labels';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';
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

type ManifestTexts = WebMessages['runs']['review']['manifest'];

function assetColumns(t: ManifestTexts, ui: UiMessages): readonly TableColumn<BoundAsset>[] {
  return [
    { key: 'slot', header: t.slot, rowHeader: true, render: (asset) => <span className="mono">{asset.slot}</span> },
    { key: 'ref', header: t.asset, render: (asset) => <span className="mono">{asset.ref}</span> },
    { key: 'hash', header: t.hash, render: (asset) => hashCell(asset.contentHash) },
    { key: 'sensitivity', header: t.sensitivity, render: (asset) => ui.status.sensitivity[asset.sensitivity] },
  ];
}

function referenceColumns(t: ManifestTexts): readonly TableColumn<PinnedReference>[] {
  return [
    { key: 'ref', header: t.asset, rowHeader: true, render: (reference) => <span className="mono">{reference.ref}</span> },
    { key: 'hash', header: t.hash, render: (reference) => hashCell(reference.contentHash) },
  ];
}

/**
 * Card "Manifesto" (design/telas/09, PRD 7.4): recipe pin, parameters, models and every bound
 * asset with its hash. Refs and hashes only; nothing here loads asset bytes.
 */
export async function ReviewManifestCard({ manifest }: ReviewManifestCardProps): Promise<ReactElement> {
  const { t, ui } = await getI18n();
  const texts = t.runs.review.manifest;
  if (manifest.status !== 'present') {
    return (
      <Card title={texts.card}>
        <Alert variant="warning">
          {manifest.status === 'absent' ? texts.absent : texts.unreadable}
        </Alert>
      </Card>
    );
  }
  const { recipe, parameters, models, assets, references } = manifest.value;
  const brief = parameters.brief;
  return (
    <Card title={texts.card}>
      <div className={layout.stack}>
        <DescriptionList
          items={[
            { term: texts.recipe, description: `${recipe.ref} · ${shortenHash(recipe.contentHash)}`, mono: true },
            {
              term: texts.parameters,
              description: `${brief.topic} · ${brief.format} · ${texts.seconds(brief.targetDurationSec)} · ${languageLabels[brief.language]}`,
            },
            {
              term: texts.models,
              description: models.length === 0 ? '—' : models.map((model) => `${model.role}: ${model.modelId}`).join(' · '),
              mono: true,
            },
          ]}
        />
        <Table
          caption={texts.assetsTable}
          columns={assetColumns(texts, ui)}
          rows={assets}
          rowKey={(asset) => `${asset.slot}-${asset.ref}`}
          emptyText={texts.noAssets}
        />
        {references.length > 0 && (
          <Table
            caption={texts.referencesTable}
            columns={referenceColumns(texts)}
            rows={references}
            rowKey={(reference) => reference.ref}
            emptyText={texts.noReferences}
          />
        )}
      </div>
    </Card>
  );
}
