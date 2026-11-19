import { Alert, Badge, Card, Table, formatUsd, textLinkClassName, type TableColumn } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import { type CurationSubject } from '@studio/shared/curation';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatDateTime } from '@/features/runs/run-labels';
import { curationDecisionText, curationHref, curationProgressText, curationStatusTones } from '../curation-labels';
import { loadSubjectCurations } from '../curations.server';
import { RequestCurationForm } from './RequestCurationForm';

interface SubjectCurationsCardProps {
  subject: CurationSubject;
  /**
   * Why this version cannot receive a new request (deprecated or biometric, SPEC 0005 section
   * 5.9), or null when the request button is shown.
   */
  blockedText: string | null;
}

const columns: readonly TableColumn<CurationView>[] = [
  {
    key: 'requested',
    header: 'Pedida em',
    rowHeader: true,
    render: (curation) => (
      <Link href={curationHref(curation.curationId)} className={textLinkClassName()}>
        {formatDateTime(curation.requestedAt)}
      </Link>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (curation) => <Badge tone={curationStatusTones[curation.status]}>{curationProgressText(curation)}</Badge>,
  },
  { key: 'decision', header: 'Sua decisão', render: (curation) => curationDecisionText(curation.decision) ?? '—' },
  { key: 'spent', header: 'Gasto', align: 'end', render: (curation) => formatUsd(curation.spentUsd) },
];

/**
 * "Propostas do curador" on a prompt, skill or recipe version page (SPEC 0005 section 5.9): the
 * request form with its $1.00 consent, then this version's curations, newest first. Nothing in
 * this card changes a version's status.
 */
export async function SubjectCurationsCard({ subject, blockedText }: SubjectCurationsCardProps): Promise<ReactElement> {
  const curations = await loadSubjectCurations(subject);
  return (
    <Card
      title="Propostas do curador"
      description="O curador lê as execuções revisadas desta versão e propõe uma versão nova em rascunho. Ativar continua sendo decisão sua."
    >
      <div className={layout.stack}>
        {blockedText === null ? <RequestCurationForm subject={subject} /> : <p className="caption">{blockedText}</p>}
        {curations.status === 'failed' ? (
          <Alert variant="warning">{`Não foi possível carregar as propostas desta versão. ${curations.message}`}</Alert>
        ) : (
          <Table
            caption="Propostas do curador para esta versão"
            hideCaption
            columns={columns}
            rows={curations.items}
            rowKey={(curation) => curation.curationId}
            emptyText="Nenhuma proposta para esta versão ainda."
          />
        )}
      </div>
    </Card>
  );
}
