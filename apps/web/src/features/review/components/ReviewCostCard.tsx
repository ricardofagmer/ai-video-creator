import { Alert, Card, Table, formatUsd, type Locale, type TableColumn } from '@studio/ui';
import { type CostFile, type CostSession } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { type ArtifactRead } from '../media-safety';
import { formatInteger } from '@/lib/i18n/format';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';
import { costSessionActor } from '../review-labels';

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

type CostTexts = WebMessages['runs']['review']['cost'];

/** What a session without tokens was billed for: characters of speech, or seconds of render or music. */
function billedUnits(session: Exclude<CostSession, { kind: 'model' }>, t: CostTexts, formatInt: (value: number) => string): string {
  switch (session.kind) {
    case 'tts':
      return t.characters(formatInt(session.characters));
    case 'render':
      return t.seconds(formatInt(Math.round(session.renderSeconds)));
    case 'music':
      return t.seconds(formatInt(Math.round(session.musicSeconds)));
  }
}

function costRow(session: CostSession, index: number, t: CostTexts, locale: Locale): CostRow {
  const formatInt = (value: number): string => formatInteger(value, locale);
  const base = { key: `${index}-${session.sessionId}`, session: session.sessionId, actor: costSessionActor(session, t), usd: session.usd };
  if (session.kind !== 'model') {
    return { ...base, inputTokens: billedUnits(session, t, formatInt), outputTokens: DASH, cache: DASH };
  }
  const cacheTokens = (session.cacheReadTokens ?? 0) + (session.cacheWriteTokens ?? 0);
  return {
    ...base,
    inputTokens: formatInt(session.inputTokens),
    outputTokens: formatInt(session.outputTokens),
    cache: session.cacheReadTokens === null && session.cacheWriteTokens === null ? DASH : formatInt(cacheTokens),
  };
}

function costColumns(t: CostTexts, locale: Locale): readonly TableColumn<CostRow>[] {
  const header = t.columns;
  return [
  { key: 'session', header: header.session, rowHeader: true, render: (row) => <span className="mono">{row.session}</span> },
  { key: 'actor', header: header.actor, render: (row) => row.actor },
  { key: 'input', header: header.inputTokens, align: 'end', render: (row) => row.inputTokens },
  { key: 'output', header: header.outputTokens, align: 'end', render: (row) => row.outputTokens },
  { key: 'cache', header: header.cache, align: 'end', render: (row) => row.cache },
  { key: 'usd', header: header.usd, align: 'end', render: (row) => formatUsd(row.usd, locale) },
  ];
}

/** Card "Custo" (design/telas/09): `cost.json`, whose total equals the sum of the sessions (C3). */
export async function ReviewCostCard({ cost }: ReviewCostCardProps): Promise<ReactElement> {
  const { t, locale } = await getI18n();
  const texts = t.runs.review.cost;
  if (cost.status !== 'present') {
    return (
      <Card title={texts.card}>
        <Alert variant="warning">
          {cost.status === 'absent' ? texts.absent : texts.unreadable}
        </Alert>
      </Card>
    );
  }
  const rows: CostRow[] = [
    ...cost.value.sessions.map((session, index) => costRow(session, index, texts, locale)),
    { key: 'total', session: texts.total, actor: '', inputTokens: '', outputTokens: '', cache: '', usd: cost.value.totalUsd },
  ];
  return (
    <Card title={texts.card}>
      <div className={layout.stack}>
        <p>
          <span className="caption">{texts.totalPrefix}</span>
          <span className="metric">{formatUsd(cost.value.totalUsd, locale)}</span>
        </p>
        <Table caption={texts.table} columns={costColumns(texts, locale)} rows={rows} rowKey={(row) => row.key} emptyText={texts.empty} />
      </div>
    </Card>
  );
}
