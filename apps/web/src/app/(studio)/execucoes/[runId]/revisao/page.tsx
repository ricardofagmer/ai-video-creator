import { Alert, Card, EmptyState, StatusBadge, buttonClassName, textLinkClassName } from '@studio/ui';
import { RunIdSchema, latestDecision, type GateDecision } from '@studio/shared/run-format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StudioHero } from '@/features/common/components/StudioHero';
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
import { SaveRunVideoCard } from '@/features/review/components/SaveRunVideoCard';
import { allowsArtifactLinks } from '@/features/review/media-safety';
import { loadReviewData } from '@/features/review/review-data.server';
import styles from '@/features/review/review.module.css';
import { getI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

interface ReviewPageProps {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type FinalDecision = Extract<GateDecision, { kind: 'final' }>;

function isFinalDecision(decision: GateDecision | undefined): decision is FinalDecision {
  return decision !== undefined && decision.kind === 'final';
}

export async function generateMetadata({ params }: ReviewPageProps): Promise<Metadata> {
  const { runId } = await params;
  const { t } = await getI18n();
  return { title: RunIdSchema.safeParse(runId).success ? t.runs.review.pageTitle(runId) : t.runs.review.title };
}

/** design/telas/09: `/execucoes/[runId]/revisao`, the final human gate (D14). */
export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  const { runId } = await params;
  // Set by the run page when it redirects here as the run finishes, so the outcome plays at once.
  const autoPlay = (await searchParams).reproduzir === '1';
  const data = await loadReviewData(runId);
  const { t } = await getI18n();

  if (data.kind === 'missing') {
    return (
      <EmptyState
        title={t.runs.run.notFound}
        action={
          <Link href="/execucoes" className={buttonClassName({ variant: 'secondary' })}>
            {t.runs.run.backToList}
          </Link>
        }
      />
    );
  }

  const back = (
    <Link href={`/execucoes/${runId}`} className={textLinkClassName()}>
      {t.runs.review.backToRun} <span className="mono">{runId}</span>
    </Link>
  );
  const { run, displayedStatus, approval, artifactAccess } = data.state;
  const header = (
    <StudioHero
      variant="compact"
      eyebrow={t.common.heroEyebrows.review}
      glyph="play"
      back={back}
      title={t.runs.review.title}
      meta={<StatusBadge kind="run" status={displayedStatus} />}
      description={`${run.recipe.definition.name} · ${run.recipe.ref}`}
    />
  );

  if (data.kind === 'not-ready') {
    return (
      <div className={layout.page}>
        {header}
        <EmptyState
          title={t.runs.review.notReady}
          action={
            <Link href={`/execucoes/${runId}`} className={buttonClassName({ variant: 'primary' })}>
              {t.runs.review.followRun}
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
          <ReviewVideoCard runId={runId} aspect={run.recipe.definition.format.aspect} video={data.video} qa={data.qa} autoPlay={autoPlay} />
        </div>
        <div className={styles.review}>
          <Card title={t.runs.review.yourReview}>
            {run.state.status === 'review' ? (
              <ReviewForm runId={runId} checklist={checklist} />
            ) : isFinalDecision(decision) ? (
              <ReviewDecisionSummary decision={decision} checklist={checklist} />
            ) : (
              <Alert variant="info">{t.runs.review.alreadyDecided}</Alert>
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
        <div className={styles.promote}>
          {artifactLinks && data.video.kind === 'playable' && <SaveRunVideoCard runId={runId} />}
          {artifactLinks && outputs.length > 0 && <PromoteFromRunCard runId={runId} outputs={outputs} />}
        </div>
      </div>
    </div>
  );
}
