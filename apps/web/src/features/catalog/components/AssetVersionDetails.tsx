import { Card, DescriptionList, Table, formatBytes, type DescriptionItem } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { type ModelIdReference, type PromptVariable, type ProvenanceSource } from '@studio/shared/catalog';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatDate, formatDateTime, licenseUseLabels, sensitivityLabels, usageLabel } from '../catalog-labels';

const NOT_INFORMED = 'Não informada';

function modelReferenceText(reference: ModelIdReference): string {
  if (reference.type === 'literal') return reference.value;
  return reference.type === 'env' ? `variável de ambiente ${reference.name}` : `item do Keychain ${reference.name}`;
}

function provenanceSourceText(source: ProvenanceSource): string {
  switch (source.type) {
    case 'url':
      return source.url;
    case 'created-here':
      return 'Criado aqui';
    case 'seed':
      return `Importado de ${source.origin}`;
    case 'run':
      return `Execução ${source.runId}`;
    case 'comparison':
      return `Comparação ${source.comparisonId}`;
    case 'curator':
      return `Proposta do curador ${source.curationId}`;
  }
}

function variableDefaultText(variable: PromptVariable): string {
  if (variable.default === null) return '—';
  return Array.isArray(variable.default) ? variable.default.join(', ') : String(variable.default);
}

/** Kind-specific fields (PRD 5.2) for the kinds design/telas/03 lists. */
function kindItems(version: AssetVersionView): DescriptionItem[] {
  switch (version.kind) {
    case 'template': {
      const { canvas, aspect, fps, duration } = version.details;
      return [
        { term: 'Formato', description: `${canvas.width}x${canvas.height} (${aspect})` },
        { term: 'FPS', description: String(fps) },
        { term: 'Faixa de duração', description: `${duration.minSec}–${duration.maxSec} s` },
      ];
    }
    case 'ai-model': {
      const localPath = version.storage.mode === 'reference' ? version.storage.absolutePath : null;
      return [
        { term: 'Provedor', description: version.details.provider },
        { term: 'Referência do modelo', description: modelReferenceText(version.details.modelIdRef), mono: true },
        { term: 'Caminho local', description: localPath ?? '—', mono: localPath !== null },
      ];
    }
    default:
      return [];
  }
}

function storageItems(version: AssetVersionView): DescriptionItem[] {
  if (version.storage.mode !== 'reference') return [];
  // The path only: the web never reads, fetches or previews by-reference content (PRD 12).
  const path = version.storage.absolutePath;
  return [{ term: 'Armazenado por referência', description: path ?? 'Caminho oculto (material biométrico)', mono: path !== null }];
}

function PromptVariablesTable({ variables }: { variables: readonly PromptVariable[] }): ReactElement {
  return (
    <Table
      caption="Variáveis"
      columns={[
        { key: 'name', header: 'Nome', rowHeader: true, render: (variable: PromptVariable) => <span className="mono">{variable.name}</span> },
        { key: 'type', header: 'Tipo', render: (variable: PromptVariable) => variable.type },
        { key: 'default', header: 'Padrão', render: (variable: PromptVariable) => variableDefaultText(variable) },
      ]}
      rows={variables}
      rowKey={(variable) => variable.name}
      emptyText="Sem variáveis."
    />
  );
}

/** design/telas/03 main column: Metadados, Licença e procedência, Notas. */
export function AssetVersionDetails({ version }: { version: AssetVersionView }): ReactElement {
  const metadata: DescriptionItem[] = [
    { term: 'Hash', description: version.contentHash, mono: true },
    { term: 'Tamanho', description: formatBytes(version.sizeBytes) },
    { term: 'Tipo MIME', description: version.mimeType, mono: true },
    { term: 'Proprietário', description: version.owner },
    { term: 'Criado em', description: formatDateTime(version.createdAt) },
    { term: 'Atualizado em', description: formatDateTime(version.updatedAt) },
    { term: 'Etiquetas', description: version.tags.length > 0 ? version.tags.join(', ') : '—' },
    { term: 'Uso', description: usageLabel(version.usageCount) },
    { term: 'Sensibilidade', description: sensitivityLabels[version.sensitivity] },
    ...storageItems(version),
    ...kindItems(version),
  ];
  const { license, provenance } = version;
  const licenseItems: DescriptionItem[] = [
    { term: 'Licença', description: license?.name ?? NOT_INFORMED },
    { term: 'URL da licença', description: license?.url ?? NOT_INFORMED },
    { term: 'Lida em', description: license === null ? NOT_INFORMED : formatDate(license.readOn) },
    {
      term: 'Usos permitidos',
      description: license === null ? NOT_INFORMED : license.allowedUses.map((use) => licenseUseLabels[use]).join(', '),
    },
    { term: 'Origem', description: provenance === null ? NOT_INFORMED : provenanceSourceText(provenance.source) },
    { term: 'Autor', description: provenance?.author ?? NOT_INFORMED },
    {
      term: 'Data de captura',
      description: provenance === null || provenance.capturedAt === null ? NOT_INFORMED : formatDate(provenance.capturedAt),
    },
  ];

  return (
    <div className={layout.stackLarge}>
      <Card title="Metadados">
        <div className={layout.stack}>
          <DescriptionList items={metadata} columns={2} />
          {version.kind === 'prompt' && <PromptVariablesTable variables={version.details.variables} />}
        </div>
      </Card>
      <Card title="Licença e procedência">
        <DescriptionList items={licenseItems} columns={2} />
      </Card>
      <Card title="Notas">
        {version.notes === '' ? <p className="caption">Sem notas nesta versão.</p> : <p className="body">{version.notes}</p>}
      </Card>
    </div>
  );
}
