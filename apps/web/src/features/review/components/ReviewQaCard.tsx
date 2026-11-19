import { Alert, Card, QaResultList, textLinkClassName, type QaResultItem } from '@studio/ui';
import { type CheckResult, type QaReview, type QaSummary } from '@studio/shared/run-format';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { stageLabels } from '@/features/recipes/recipe-labels';
import { runArtifactUrl } from '@/features/runs/runs-api';
import { type ArtifactRead } from '../media-safety';
import { checkLabels, checkOutcomeResults, formatDecimal, reviewSubjectLabels } from '../review-labels';

interface ReviewQaCardProps {
  runId: string;
  qa: ArtifactRead<QaSummary>;
  /** `allowsArtifactLinks(artifactAccess)`: false on a biometric or withheld run (R4-13). */
  artifactLinks: boolean;
}

/** Where an evidence file is: a link on a `playable` run, its run-relative path as text otherwise. */
type EvidenceRenderer = (path: string) => ReactElement;

/**
 * Evidence files are served by the api as inline text or as an octet-stream attachment, behind
 * its CSP sandbox and nosniff headers, so a link to them never renders run output as a page. On a
 * `playable-biometric` or `withheld` run the screen carries no link to the artifact route at all
 * (SPEC 0002 rev 4, R4-13), so the path is shown as text for `studio doctor` and the run folder.
 */
function evidenceRenderer(runId: string, artifactLinks: boolean): EvidenceRenderer {
  if (!artifactLinks) {
    return (path) => (
      <span className="caption">
        Evidência: <span className="mono">{path}</span>
      </span>
    );
  }
  return (path) => (
    <a href={runArtifactUrl(runId, path)} className={textLinkClassName()} target="_blank" rel="noopener noreferrer">
      Evidência<span className="visually-hidden"> {path}</span>
    </a>
  );
}

/** The last attempt of each check per stage: earlier attempts were superseded by a rerun. */
function latestChecks(checks: readonly CheckResult[]): CheckResult[] {
  const latest = new Map<string, CheckResult>();
  for (const check of checks) {
    const key = `${check.checkId}:${check.stageNumber}`;
    const current = latest.get(key);
    if (current === undefined || check.attempt >= current.attempt) latest.set(key, check);
  }
  return [...latest.values()];
}

function checkItem(evidence: EvidenceRenderer, check: CheckResult): QaResultItem {
  return {
    id: `check-${check.checkId}-${check.stageNumber}`,
    label: `${checkLabels[check.checkId]} · ${stageLabels[check.stageId]}`,
    result: checkOutcomeResults[check.outcome],
    measuredLabel: check.measured === '' ? undefined : check.measured,
    expectedLabel: check.expected === '' ? undefined : check.expected,
    evidence: check.rawOutputPath === null ? undefined : evidence(check.rawOutputPath),
  };
}

function reviewItem(evidence: EvidenceRenderer, review: QaReview): QaResultItem {
  const label = `Revisão do agente: ${reviewSubjectLabels[review.subject]}`;
  if (review.status === 'unavailable') {
    return { id: `review-${review.subject}`, label, result: 'warning', measuredLabel: review.reason };
  }
  return {
    id: `review-${review.subject}`,
    label,
    result: 'pass',
    measuredLabel: `nota ${formatDecimal(review.overall)} de 5`,
    evidence: evidence(review.verdictPath),
  };
}

/** Card "Checagens de qualidade" (design/telas/09). Run text is shown as React text only. */
export function ReviewQaCard({ runId, qa, artifactLinks }: ReviewQaCardProps): ReactElement {
  if (qa.status !== 'present') {
    return (
      <Card title="Checagens de qualidade">
        <Alert variant="warning">
          {qa.status === 'absent'
            ? 'O resumo de QA (qa/summary.json) não foi encontrado nesta execução.'
            : 'O resumo de QA (qa/summary.json) não pôde ser lido.'}
        </Alert>
      </Card>
    );
  }
  const evidence = evidenceRenderer(runId, artifactLinks);
  const items = [
    ...latestChecks(qa.value.checks).map((check) => checkItem(evidence, check)),
    ...qa.value.reviews.map((review) => reviewItem(evidence, review)),
  ];
  return (
    <Card title="Checagens de qualidade">
      <div className={layout.stack}>
        <QaResultList items={items} />
        {qa.value.warnings.length > 0 && (
          <Alert variant="warning" title="Avisos">
            <ul>
              {qa.value.warnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}
      </div>
    </Card>
  );
}
