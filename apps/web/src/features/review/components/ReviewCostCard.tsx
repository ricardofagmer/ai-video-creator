import { Alert, Card, Table, formatUsd, type TableColumn } from '@studio/ui';
import { type CostFile, type CostSession } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { type ArtifactRead } from '../media-safety';
import { costSessionActor, formatInteger } from '../review-labels';

interface ReviewCostCardProps {
  cost: ArtifactRead<CostFile>;
}

/** One line of "Custo por sessão"; the last line is the run total (design/telas/09). */
interface CostRow {
  key: string;
  session: string;
  actor: string;
  inputTokens: string;
  outputTokens: string;
  cache: string;
  usd: number;
}

const DASH = '—';

function costRow(session: CostSession, index: number): CostRow {
  const base = { key: `${index}-${session.sessionId}`, session: session.sessionId, actor: costSessionActor(session), usd: session.usd };
  if (session.kind !== 'model') {
    const units = session.kind === 'tts' ? `${formatInteger(session.characters)} caracteres` : `${formatInteger(Math.round(session.renderSeconds))} s`;
    return { ...base, inputTokens: units, outputTokens: DASH, cache: DASH };
  }
  const cacheTokens = (session.cacheReadTokens ?? 0) + (session.cacheWriteTokens ?? 0);
  return {
    ...base,
    inputTokens: formatInteger(session.inputTokens),
    outputTokens: formatInteger(session.outputTokens),
    cache: session.cacheReadTokens === null && session.cacheWriteTokens === null ? DASH : formatInteger(cacheTokens),
  };
}

const columns: readonly TableColumn<CostRow>[] = [
  { key: 'session', header: 'Sessão', rowHeader: true, render: (row) => <span className="mono">{row.session}</span> },
  { key: 'actor', header: 'Agente ou ferramenta', render: (row) => row.actor },
  { key: 'input', header: 'Tokens de entrada', align: 'end', render: (row) => row.inputTokens },
  { key: 'output', header: 'Tokens de saída', align: 'end', render: (row) => row.outputTokens },
  { key: 'cache', header: 'Cache', align: 'end', render: (row) => row.cache },
  { key: 'usd', header: 'USD', align: 'end', render: (row) => formatUsd(row.usd) },
];

/** Card "Custo" (design/telas/09): `cost.json`, whose total equals the sum of the sessions (C3). */
export function ReviewCostCard({ cost }: ReviewCostCardProps): ReactElement {
  if (cost.status !== 'present') {
    return (
      <Card title="Custo">
        <Alert variant="warning">
          {cost.status === 'absent' ? 'O arquivo de custo (cost.json) não foi encontrado.' : 'O arquivo de custo (cost.json) não pôde ser lido.'}
        </Alert>
      </Card>
    );
  }
  const rows: CostRow[] = [
    ...cost.value.sessions.map(costRow),
    { key: 'total', session: 'Total', actor: '', inputTokens: '', outputTokens: '', cache: '', usd: cost.value.totalUsd },
  ];
  return (
    <Card title="Custo">
      <div className={layout.stack}>
        <p>
          <span className="caption">Total </span>
          <span className="metric">{formatUsd(cost.value.totalUsd)}</span>
        </p>
        <Table caption="Custo por sessão" columns={columns} rows={rows} rowKey={(row) => row.key} emptyText="Nenhuma sessão registrada." />
      </div>
    </Card>
  );
}
