import { Alert, Card, EmptyState, PageHeader, StatusBadge, buttonClassName, textLinkClassName } from '@studio/ui';
import { RunIdSchema, latestDecision, type GateDecision } from '@studio/shared/run-format';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import { RunLearningsCard } from '@/features/learnings/components/RunLearningsCard';
import { loadRunLearnings } from '@/features/learnings/run-learnings.server';
import { PromoteFromRunCard } from '@/features/review/components/PromoteFromRunCard';
import { ReviewCostCard } from '@/features/review/components/ReviewCostCard';
import { ReviewDecisionSummary } from '@/features/review/components/ReviewDecisionSummary';
import { ReviewForm } from '@/features/review/components/ReviewForm';
import { ReviewManifestCard } from '@/features/review/components/ReviewManifestCard';
import { ReviewQaCard } from '@/features/review/components/ReviewQaCard';
import { ReviewVideoCard } from '@/features/review/components/ReviewVideoCard';
import { allowsArtifactLinks } from '@/features/review/media-safety';
import { loadReviewData } from '@/features/review/review-data.server';
import styles from '@/features/review/review.module.css';

export const dynamic = 'force-dynamic';

interface ReviewPageProps {
  params: Promise<{ runId: string }>;
}

type FinalDecision = Extract<GateDecision, { kind: 'final' }>;

function isFinalDecision(decision: GateDecision | undefined): decision is FinalDecision {
  return decision !== undefined && decision.kind === 'final';
}

export async function generateMetadata({ params }: ReviewPageProps): Promise<Metadata> {
  const { runId } = await params;
  return { title: RunIdSchema.safeParse(runId).success ? `Revisão · ${runId}` : 'Revisão' };
}

/** design/telas/09: `/execucoes/[runId]/revisao`, the final human gate (D14). */
export default async function ReviewPage({ params }: ReviewPageProps) {
  const { runId } = await params;
  const data = await loadReviewData(runId);

  if (data.kind === 'missing') {
    return (
      <EmptyState
        title="Execução não encontrada"
        action={
          <Link href="/execucoes" className={buttonClassName({ variant: 'secondary' })}>
            Voltar às execuções
          </Link>
        }
      />
    );
  }

  const back = (
    <Link href={`/execucoes/${runId}`} className={textLinkClassName()}>
      ← Execução <span className="mono">{runId}</span>
    </Link>
  );
  const { run, displayedStatus, approval, artifactAccess } = data.state;
  const header = (
    <PageHeader
      back={back}
      title="Revisão"
      meta={<StatusBadge kind="run" status={displayedStatus} />}
      description={`${run.recipe.definition.name} · ${run.recipe.ref}`}
    />
  );

  if (data.kind === 'not-ready') {
    return (
      <div className={layout.page}>
        {header}
        <EmptyState
          title="Esta execução ainda não chegou à revisão"
          action={
            <Link href={`/execucoes/${runId}`} className={buttonClassName({ variant: 'primary' })}>
              Acompanhar a execução
            </Link>
          }
        />
      </div>
    );
  }

  const checklist = run.recipe.definition.checklist;
  const decision = approval === null ? undefined : latestDecision(approval, 'final');
  const outputs = data.manifest.status === 'present' ? data.manifest.value.outputs : [];
  // Rev 4 (section 13.5): links to the artifact route and the promote action only on a `playable`
  // run. Promote of biometric material stays refused by the api as well (R4-12).
  const artifactLinks = allowsArtifactLinks(artifactAccess);
  // Rev 3 (SPEC 0003 section 5.5): notes are saved from the versions in this run's manifest.
  const learnings = await loadRunLearnings(runId, data.manifest);

  return (
    <div className={layout.page}>
      {header}
      <div className={styles.reviewGrid}>
        <div className={styles.video}>
          <ReviewVideoCard runId={runId} aspect={run.recipe.definition.format.aspect} video={data.video} qa={data.qa} />
        </div>
        <div className={styles.review}>
          <Card title="Sua revisão">
            {run.state.status === 'review' ? (
              <ReviewForm runId={runId} checklist={checklist} />
            ) : isFinalDecision(decision) ? (
              <ReviewDecisionSummary decision={decision} checklist={checklist} />
            ) : (
              <Alert variant="info">A decisão desta execução já foi registrada.</Alert>
            )}
          </Card>
        </div>
        <div className={styles.qa}>
          <ReviewQaCard runId={runId} qa={data.qa} artifactLinks={artifactLinks} />
        </div>
        <div className={styles.cost}>
          <ReviewCostCard cost={data.cost} />
        </div>
        <div className={styles.manifest}>
          <ReviewManifestCard manifest={data.manifest} />
        </div>
        <div className={styles.learnings}>
          <RunLearningsCard runId={runId} data={learnings} />
        </div>
        <div className={styles.promote}>{artifactLinks && outputs.length > 0 && <PromoteFromRunCard runId={runId} outputs={outputs} />}</div>
      </div>
    </div>
  );
}
