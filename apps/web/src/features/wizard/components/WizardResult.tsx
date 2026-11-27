import { Alert, Card, buttonClassName } from '@studio/ui';
import { latestDecision, type GateDecision } from '@studio/shared/run-format';
import Link from 'next/link';
import { type ReactElement } from 'react';
import { ReviewDecisionSummary } from '@/features/review/components/ReviewDecisionSummary';
import { ReviewForm } from '@/features/review/components/ReviewForm';
import { ReviewVideoCard } from '@/features/review/components/ReviewVideoCard';
import { type ReviewPageData } from '@/features/review/review-data.server';
import reviewStyles from '@/features/review/review.module.css';
import { type WebMessages } from '@/messages';
import styles from '../wizard.module.css';

type FinalDecision = Extract<GateDecision, { kind: 'final' }>;

function isFinalDecision(decision: GateDecision | undefined): decision is FinalDecision {
  return decision !== undefined && decision.kind === 'final';
}

interface WizardResultProps {
  runId: string;
  data: Extract<ReviewPageData, { kind: 'ready' }>;
  texts: WebMessages['wizard']['result'];
  /** `?reproduzir=1`: the run just finished in step 5, so the video starts on its own. */
  autoPlay?: boolean;
}

/**
 * Step 6 "Resultado": the final video and the owner's decision, from the review page's own
 * pieces. QA, cost, manifest and learnings stay on the full review page, one link away.
 */
export function WizardResult({ runId, data, texts, autoPlay = false }: WizardResultProps): ReactElement {
  const { run, approval } = data.state;
  const checklist = run.recipe.definition.checklist;
  const decision = approval === null ? undefined : latestDecision(approval, 'final');
  const runPath = `/execucoes/${encodeURIComponent(runId)}`;

  return (
    <>
      <div className={reviewStyles.reviewGrid}>
        <div className={reviewStyles.video}>
          <ReviewVideoCard runId={runId} aspect={run.recipe.definition.format.aspect} video={data.video} qa={data.qa} autoPlay={autoPlay} />
        </div>
        <div className={reviewStyles.review}>
          <Card title={texts.reviewCard}>
            {run.state.status === 'review' ? (
              <ReviewForm runId={runId} checklist={checklist} />
            ) : isFinalDecision(decision) ? (
              <ReviewDecisionSummary decision={decision} checklist={checklist} />
            ) : (
              <Alert variant="info">{texts.alreadyDecided}</Alert>
            )}
          </Card>
        </div>
      </div>
      <div className={styles.footer}>
        <span className={styles.footerEnd}>
          <Link href={`${runPath}/revisao`} className={buttonClassName({ variant: 'secondary' })}>
            {texts.openReview}
          </Link>
          <Link href={runPath} className={buttonClassName({ variant: 'secondary' })}>
            {texts.openRun}
          </Link>
          <Link href="/criar" className={buttonClassName({ variant: 'primary' })}>
            {texts.createAnother}
          </Link>
        </span>
      </div>
    </>
  );
}
