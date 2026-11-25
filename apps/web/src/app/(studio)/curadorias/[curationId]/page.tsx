import { Alert, Badge, Card, EmptyState, buttonClassName, formatUsd, textLinkClassName, type Locale } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import { curationBounds, isTerminalCurationStatus } from '@studio/shared/curation';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { StudioHero } from '@/features/common/components/StudioHero';
import layout from '@/features/common/layout.module.css';
import {
  curatedVersionHref,
  curationOutcomeText,
  curationProgressText,
  curationStatusTones,
} from '@/features/curations/curation-labels';
import { loadCompareOptions, loadCuration } from '@/features/curations/curations.server';
import styles from '@/features/curations/curations.module.css';
import { CurationCompareForm } from '@/features/curations/components/CurationCompareForm';
import { CurationDecisionActions } from '@/features/curations/components/CurationDecisionActions';
import { CurationProposalDetails } from '@/features/curations/components/CurationProposalDetails';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime } from '@/features/runs/run-labels';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export const dynamic = 'force-dynamic';

interface CurationPageProps {
  params: Promise<{ curationId: string }>;
}

export async function generateMetadata({ params }: CurationPageProps): Promise<Metadata> {
  const { curationId } = await params;
  const curation = await loadCuration(curationId);
  const { t } = await getI18n();
  return { title: curation === null ? t.curations.page.title : t.curations.page.titleOf(curation.subject.title) };
}

/** "Na fila (posição N)" / "O curador está trabalhando", or the T§9 text of an outcome without a proposal. */
function ProgressNotice({ curation, t }: { curation: CurationView; t: WebMessages['curations'] }): ReactElement | null {
  if (!isTerminalCurationStatus(curation.status)) {
    return <Alert variant="info">{t.page.autoRefresh(curationProgressText(curation, t))}</Alert>;
  }
  const outcome = curationOutcomeText(curation, t);
  if (outcome === null) return null;
  // Model-written `noChangeReason` is inside `outcome`: rendered as a text node only.
  return (
    <Alert variant={curation.status === 'failed' ? 'error' : 'warning'}>
      <span className={styles.plainText}>{outcome}</span>
    </Alert>
  );
}

/** The owner's decision on the proposal, the actions while undecided, and "Comparar" after saving. */
async function DecisionSection({ curation, t, locale }: { curation: CurationView; t: WebMessages; locale: Locale }): Promise<ReactElement | null> {
  const texts = t.curations.decision;
  const { decision, proposal } = curation;
  if (curation.status !== 'proposed' || proposal === null) return null;

  if (decision === null) {
    return (
      <Card title={texts.title}>
        <CurationDecisionActions curationId={curation.curationId} />
      </Card>
    );
  }

  if (decision.action === 'declined') {
    return (
      <Card title={texts.title}>
        <div className={layout.stack}>
          <p className={styles.plainText}>{texts.declined(formatDateTime(decision.decidedAt, locale))}</p>
          {decision.ownerReason !== null && <p className={styles.plainText}>{texts.reason(decision.ownerReason)}</p>}
        </div>
      </Card>
    );
  }

  const savedRef = decision.savedRef;
  const savedHref = savedRef === null ? null : curatedVersionHref(curation.subject.kind, savedRef);
  const saved = (
    <Alert variant="success">
      {texts.savedBefore}
      {savedHref === null ? (
        <span className="mono">{savedRef ?? '—'}</span>
      ) : (
        <Link href={savedHref} className={textLinkClassName()}>
          <span className="mono">{savedRef}</span>
        </Link>
      )}
      {texts.savedAfter}
    </Alert>
  );

  if (decision.comparisonId !== null) {
    return (
      <Card title={texts.title}>
        <div className={layout.stack}>
          {saved}
          <Link href={`/comparacoes/${encodeURIComponent(decision.comparisonId)}`} className={textLinkClassName()}>
            {texts.openComparison}
          </Link>
        </div>
      </Card>
    );
  }

  if (savedRef === null) return <Card title={texts.title}>{saved}</Card>;

  const compare = await loadCompareOptions(curation.subject);
  return (
    <div className={layout.stackLarge}>
      <Card title={texts.title}>{saved}</Card>
      <Card
        title={texts.compareTitle}
        description={proposal.suggestComparison ? texts.compareSuggested : texts.compareOptional}
      >
        {compare.status === 'failed' ? (
          <Alert variant="warning">{texts.compareLoadFailed(compare.message)}</Alert>
        ) : compare.options.length === 0 ? (
          <p className="caption">{texts.noCompareOptions}</p>
        ) : (
          <CurationCompareForm curationId={curation.curationId} subjectKind={curation.subject.kind} savedRef={savedRef} options={compare.options} />
        )}
      </Card>
    </div>
  );
}

/**
 * SPEC 0005 section 5.9: `/curadorias/[curationId]`, a Curator proposal and the owner's decision.
 * The page polls (a server refresh every second) while the curation is `requested` or
 * `collecting`. No control here promotes a version or makes it `active` (AC 35, C5-AC-03); the
 * saved draft links to its own version page, where the promotion dialog lives.
 */
export default async function CurationPage({ params }: CurationPageProps) {
  const { curationId } = await params;
  const curation = await loadCuration(curationId);
  const { t, locale } = await getI18n();
  const texts = t.curations.page;

  if (curation === null) {
    return (
      <EmptyState
        title={texts.notFoundTitle}
        description={texts.notFoundDescription}
        action={
          <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
            {texts.backToCatalog}
          </Link>
        }
      />
    );
  }

  const { subject } = curation;
  const subjectHref = curatedVersionHref(subject.kind, subject.ref);
  const terminal = isTerminalCurationStatus(curation.status);

  return (
    <div className={layout.page}>
      <StudioHero
        variant="compact"
        eyebrow={t.common.heroEyebrows.curations}
        glyph="magnifier"
        back={
          subjectHref === null ? undefined : (
            <Link href={subjectHref} className={textLinkClassName()}>
              {`← ${subject.title}`}
            </Link>
          )
        }
        title={texts.title}
        meta={<Badge tone={curationStatusTones[curation.status]}>{curationProgressText(curation, t.curations)}</Badge>}
        description={
          <>
            {`${t.curations.kinds[subject.kind]} ${subject.title} · `}
            <span className="mono">{subject.ref}</span>
            {texts.requestedAt(formatDateTime(curation.requestedAt, locale))}
          </>
        }
      />
      <ProgressNotice curation={curation} t={t.curations} />
      {curation.ownerFocus !== null && (
        <Card title={texts.ownerFocus}>
          <p className={styles.plainText}>{curation.ownerFocus}</p>
        </Card>
      )}
      {curation.proposal !== null && <CurationProposalDetails proposal={curation.proposal} t={t.curations.proposal} />}
      <DecisionSection curation={curation} t={t} locale={locale} />
      <p className="caption">
        {texts.spent(formatUsd(curation.spentUsd, locale), formatUsd(curationBounds.maxUsd, locale))}
        {curation.endedAt !== null && texts.endedAt(formatDateTime(curation.endedAt, locale))}
      </p>
      <RunListAutoRefresh active={!terminal} />
    </div>
  );
}
