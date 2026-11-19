import { Alert, Badge, Card, EmptyState, PageHeader, buttonClassName, formatUsd, textLinkClassName } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import { curationBounds, isTerminalCurationStatus } from '@studio/shared/curation';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import {
  curatableKindLabels,
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

export const dynamic = 'force-dynamic';

interface CurationPageProps {
  params: Promise<{ curationId: string }>;
}

export async function generateMetadata({ params }: CurationPageProps): Promise<Metadata> {
  const { curationId } = await params;
  const curation = await loadCuration(curationId);
  return { title: curation === null ? 'Proposta do curador' : `${curation.subject.title} · Proposta do curador` };
}

/** "Na fila (posição N)" / "O curador está trabalhando", or the T§9 text of an outcome without a proposal. */
function ProgressNotice({ curation }: { curation: CurationView }): ReactElement | null {
  if (!isTerminalCurationStatus(curation.status)) {
    return <Alert variant="info">{`${curationProgressText(curation)}. Esta página se atualiza sozinha.`}</Alert>;
  }
  const outcome = curationOutcomeText(curation);
  if (outcome === null) return null;
  // Model-written `noChangeReason` is inside `outcome`: rendered as a text node only.
  return (
    <Alert variant={curation.status === 'failed' ? 'error' : 'warning'}>
      <span className={styles.plainText}>{outcome}</span>
    </Alert>
  );
}

/** The owner's decision on the proposal, the actions while undecided, and "Comparar" after saving. */
async function DecisionSection({ curation }: { curation: CurationView }): Promise<ReactElement | null> {
  const { decision, proposal } = curation;
  if (curation.status !== 'proposed' || proposal === null) return null;

  if (decision === null) {
    return (
      <Card title="Sua decisão">
        <CurationDecisionActions curationId={curation.curationId} />
      </Card>
    );
  }

  if (decision.action === 'declined') {
    return (
      <Card title="Sua decisão">
        <div className={layout.stack}>
          <p className={styles.plainText}>{`Você recusou esta proposta em ${formatDateTime(decision.decidedAt)}. Nenhuma versão foi criada.`}</p>
          {decision.ownerReason !== null && <p className={styles.plainText}>{`Motivo: ${decision.ownerReason}`}</p>}
        </div>
      </Card>
    );
  }

  const savedRef = decision.savedRef;
  const savedHref = savedRef === null ? null : curatedVersionHref(curation.subject.kind, savedRef);
  const saved = (
    <Alert variant="success">
      {'Proposta salva como rascunho em '}
      {savedHref === null ? (
        <span className="mono">{savedRef ?? '—'}</span>
      ) : (
        <Link href={savedHref} className={textLinkClassName()}>
          <span className="mono">{savedRef}</span>
        </Link>
      )}
      {'. Ela continua em rascunho: para ativá-la, abra a página da versão.'}
    </Alert>
  );

  if (decision.comparisonId !== null) {
    return (
      <Card title="Sua decisão">
        <div className={layout.stack}>
          {saved}
          <Link href={`/comparacoes/${encodeURIComponent(decision.comparisonId)}`} className={textLinkClassName()}>
            Abrir a comparação
          </Link>
        </div>
      </Card>
    );
  }

  if (savedRef === null) return <Card title="Sua decisão">{saved}</Card>;

  const compare = await loadCompareOptions(curation.subject);
  return (
    <div className={layout.stackLarge}>
      <Card title="Sua decisão">{saved}</Card>
      <Card
        title="Comparar"
        description={
          proposal.suggestComparison
            ? 'O curador sugere comparar a versão nova com a atual antes de ativá-la.'
            : 'Opcional: compare a versão nova com a atual numa execução lado a lado.'
        }
      >
        {compare.status === 'failed' ? (
          <Alert variant="warning">{`Não foi possível carregar as receitas para comparar. ${compare.message}`}</Alert>
        ) : compare.options.length === 0 ? (
          <p className="caption">Nenhuma receita em rascunho ou ativa usa este ativo, então não há com o que comparar.</p>
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

  if (curation === null) {
    return (
      <EmptyState
        title="Proposta do curador não encontrada"
        description="Ela pode ter sido digitada errada no endereço."
        action={
          <Link href="/catalogo" className={buttonClassName({ variant: 'secondary' })}>
            Voltar ao catálogo
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
      <PageHeader
        back={
          subjectHref === null ? undefined : (
            <Link href={subjectHref} className={textLinkClassName()}>
              {`← ${subject.title}`}
            </Link>
          )
        }
        title="Proposta do curador"
        meta={<Badge tone={curationStatusTones[curation.status]}>{curationProgressText(curation)}</Badge>}
        description={
          <>
            {`${curatableKindLabels[subject.kind]} ${subject.title} · `}
            <span className="mono">{subject.ref}</span>
            {` · pedida em ${formatDateTime(curation.requestedAt)}`}
          </>
        }
      />
      <ProgressNotice curation={curation} />
      {curation.ownerFocus !== null && (
        <Card title="O que você pediu para melhorar">
          <p className={styles.plainText}>{curation.ownerFocus}</p>
        </Card>
      )}
      {curation.proposal !== null && <CurationProposalDetails proposal={curation.proposal} />}
      <DecisionSection curation={curation} />
      <p className="caption">
        {`Gasto: ${formatUsd(curation.spentUsd)} de no máximo ${formatUsd(curationBounds.maxUsd)}.`}
        {curation.endedAt !== null && ` Terminou em ${formatDateTime(curation.endedAt)}.`}
      </p>
      <RunListAutoRefresh active={!terminal} />
    </div>
  );
}
