import { Alert, Badge, Card, Table, formatUsd, textLinkClassName, type Locale, type TableColumn } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import { type CurationSubject } from '@studio/shared/curation';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { formatDateTime } from '@/features/runs/run-labels';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';
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

function curationColumns(t: WebMessages['curations'], locale: Locale): readonly TableColumn<CurationView>[] {
  const header = t.subjectCard.columns;
  return [
  {
    key: 'requested',
    header: header.requested,
    rowHeader: true,
    render: (curation) => (
      <Link href={curationHref(curation.curationId)} className={textLinkClassName()}>
        {formatDateTime(curation.requestedAt, locale)}
      </Link>
    ),
  },
  {
    key: 'status',
    header: header.status,
    render: (curation) => <Badge tone={curationStatusTones[curation.status]}>{curationProgressText(curation, t)}</Badge>,
  },
  { key: 'decision', header: header.decision, render: (curation) => curationDecisionText(curation.decision, t) ?? '—' },
  { key: 'spent', header: header.spent, align: 'end', render: (curation) => formatUsd(curation.spentUsd, locale) },
  ];
}

/**
 * "Propostas do curador" on a prompt, skill or recipe version page (SPEC 0005 section 5.9): the
 * request form with its $1.00 consent, then this version's curations, newest first. Nothing in
 * this card changes a version's status.
 */
export async function SubjectCurationsCard({ subject, blockedText }: SubjectCurationsCardProps): Promise<ReactElement> {
  const curations = await loadSubjectCurations(subject);
  const { t, locale } = await getI18n();
  const texts = t.curations.subjectCard;
  return (
    <Card
      title={texts.title}
      description={texts.description}
    >
      <div className={layout.stack}>
        {blockedText === null ? <RequestCurationForm subject={subject} /> : <p className="caption">{blockedText}</p>}
        {curations.status === 'failed' ? (
          <Alert variant="warning">{texts.loadFailed(curations.message)}</Alert>
        ) : (
          <Table
            caption={texts.caption}
            hideCaption
            columns={curationColumns(t.curations, locale)}
            rows={curations.items}
            rowKey={(curation) => curation.curationId}
            emptyText={texts.empty}
          />
        )}
      </div>
    </Card>
  );
}
