import { Card, DescriptionList, Table, formatBytes, type DescriptionItem } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { type ModelIdReference, type PromptVariable, type ProvenanceSource } from '@studio/shared/catalog';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';
import { formatDate, formatDateTime } from '../catalog-labels';

type DetailTexts = WebMessages['catalog']['details'];

function modelReferenceText(reference: ModelIdReference, t: DetailTexts): string {
  if (reference.type === 'literal') return reference.value;
  return reference.type === 'env' ? t.modelReferenceEnv(reference.name) : t.modelReferenceKeychain(reference.name);
}

function provenanceSourceText(source: ProvenanceSource, t: DetailTexts): string {
  switch (source.type) {
    case 'url':
      return source.url;
    case 'created-here':
      return t.provenance.createdHere;
    case 'seed':
      return t.provenance.seed(source.origin);
    case 'run':
      return t.provenance.run(source.runId);
    case 'comparison':
      return t.provenance.comparison(source.comparisonId);
    case 'curator':
      return t.provenance.curator(source.curationId);
  }
}

function variableDefaultText(variable: PromptVariable): string {
  if (variable.default === null) return '—';
  return Array.isArray(variable.default) ? variable.default.join(', ') : String(variable.default);
}

/** Kind-specific fields (PRD 5.2) for the kinds design/telas/03 lists. */
function kindItems(version: AssetVersionView, t: DetailTexts): DescriptionItem[] {
  switch (version.kind) {
    case 'template': {
      const { canvas, aspect, fps, duration } = version.details;
      return [
        { term: t.format, description: `${canvas.width}x${canvas.height} (${aspect})` },
        { term: t.fps, description: String(fps) },
        { term: t.durationRange, description: t.durationRangeValue(duration.minSec, duration.maxSec) },
      ];
    }
    case 'ai-model': {
      const localPath = version.storage.mode === 'reference' ? version.storage.absolutePath : null;
      return [
        { term: t.provider, description: version.details.provider },
        { term: t.modelReference, description: modelReferenceText(version.details.modelIdRef, t), mono: true },
        { term: t.localPath, description: localPath ?? '—', mono: localPath !== null },
      ];
    }
    default:
      return [];
  }
}

function storageItems(version: AssetVersionView, t: DetailTexts): DescriptionItem[] {
  if (version.storage.mode !== 'reference') return [];
  // The path only: the web never reads, fetches or previews by-reference content (PRD 12).
  const path = version.storage.absolutePath;
  return [{ term: t.storedByReference, description: path ?? t.hiddenPath, mono: path !== null }];
}

function PromptVariablesTable({ variables, t, typeLabels }: { variables: readonly PromptVariable[]; t: DetailTexts; typeLabels: WebMessages['catalog']['form']['variables']['types'] }): ReactElement {
  return (
    <Table
      caption={t.variablesCaption}
      columns={[
        { key: 'name', header: t.variableName, rowHeader: true, render: (variable: PromptVariable) => <span className="mono">{variable.name}</span> },
        { key: 'type', header: t.variableType, render: (variable: PromptVariable) => typeLabels[variable.type] },
        { key: 'default', header: t.variableDefault, render: (variable: PromptVariable) => variableDefaultText(variable) },
      ]}
      rows={variables}
      rowKey={(variable) => variable.name}
      emptyText={t.noVariables}
    />
  );
}

/** design/telas/03 main column: Metadados, Licença e procedência, Notas. */
export async function AssetVersionDetails({ version }: { version: AssetVersionView }): Promise<ReactElement> {
  const { t, locale, ui } = await getI18n();
  const d = t.catalog.details;
  const NOT_INFORMED = d.notInformed;
  const metadata: DescriptionItem[] = [
    { term: d.hash, description: version.contentHash, mono: true },
    { term: d.size, description: formatBytes(version.sizeBytes, locale) },
    { term: d.mimeType, description: version.mimeType, mono: true },
    { term: d.owner, description: version.owner },
    { term: d.createdAt, description: formatDateTime(version.createdAt, locale) },
    { term: d.updatedAt, description: formatDateTime(version.updatedAt, locale) },
    { term: d.tags, description: version.tags.length > 0 ? version.tags.join(', ') : '—' },
    { term: d.usage, description: t.catalog.usage(version.usageCount) },
    { term: d.sensitivity, description: ui.status.sensitivity[version.sensitivity] },
    ...storageItems(version, d),
    ...kindItems(version, d),
  ];
  const { license, provenance } = version;
  const licenseItems: DescriptionItem[] = [
    { term: d.license, description: license?.name ?? NOT_INFORMED },
    { term: d.licenseUrl, description: license?.url ?? NOT_INFORMED },
    { term: d.readOn, description: license === null ? NOT_INFORMED : formatDate(license.readOn, locale) },
    {
      term: d.allowedUses,
      description: license === null ? NOT_INFORMED : license.allowedUses.map((use) => t.catalog.licenseUses[use]).join(', '),
    },
    { term: d.origin, description: provenance === null ? NOT_INFORMED : provenanceSourceText(provenance.source, d) },
    { term: d.author, description: provenance?.author ?? NOT_INFORMED },
    {
      term: d.capturedAt,
      description: provenance === null || provenance.capturedAt === null ? NOT_INFORMED : formatDate(provenance.capturedAt, locale),
    },
  ];

  return (
    <div className={layout.stackLarge}>
      <Card title={d.metadataTitle}>
        <div className={layout.stack}>
          <DescriptionList items={metadata} columns={2} />
          {version.kind === 'prompt' && <PromptVariablesTable variables={version.details.variables} t={d} typeLabels={t.catalog.form.variables.types} />}
        </div>
      </Card>
      <Card title={d.licenseTitle}>
        <DescriptionList items={licenseItems} columns={2} />
      </Card>
      <Card title={d.notesTitle}>
        {version.notes === '' ? <p className="caption">{d.noNotes}</p> : <p className="body">{version.notes}</p>}
      </Card>
    </div>
  );
}
