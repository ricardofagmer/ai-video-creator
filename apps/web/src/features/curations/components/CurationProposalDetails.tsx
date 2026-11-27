import { Card, textLinkClassName } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { type WebMessages } from '@/messages';
import styles from '../curations.module.css';

type CurationProposal = NonNullable<CurationView['proposal']>;

const DIFF_LABEL_ID = 'curadoria-diferenca-titulo';

/**
 * The proposal of a `proposed` curation (SPEC 0005 section 5.9). Every field is model-written, so
 * each one is a React text node: no markup is ever parsed from it (section 6, C5-AC-20). The diff
 * is a unified text diff inside `<pre><code>`, scrollable and reachable by keyboard.
 */
export function CurationProposalDetails({ proposal, t }: { proposal: CurationProposal; t: WebMessages['curations']['proposal'] }): ReactElement {
  const { addedLines, removedLines } = proposal.diffStats;
  return (
    <div className={layout.stackLarge}>
      <Card title={t.title}>
        <dl className={styles.fields}>
          <div>
            <dt>{t.changeSummary}</dt>
            <dd className={styles.plainText}>{proposal.changeSummary}</dd>
          </div>
          <div>
            <dt>{t.reason}</dt>
            <dd className={styles.plainText}>{proposal.reason}</dd>
          </div>
          <div>
            <dt>{t.expectedEffect}</dt>
            <dd className={styles.plainText}>{proposal.expectedEffect}</dd>
          </div>
          <div>
            <dt>{t.evidenceRuns}</dt>
            <dd>
              <ul className={styles.runLinks}>
                {proposal.evidenceRunIds.map((runId) => (
                  <li key={runId}>
                    <Link href={`/execucoes/${encodeURIComponent(runId)}`} className={textLinkClassName()}>
                      <span className="mono">{runId}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </Card>
      <Card title={t.diffTitle} description={t.diffStats(addedLines, removedLines)}>
        <p id={DIFF_LABEL_ID} className="visually-hidden">
          {t.diffLabel}
        </p>
        {proposal.diff === '' ? (
          <p className="caption">{t.noDiff}</p>
        ) : (
          // A scrollable region must be focusable so it can be scrolled without a pointer.
          <pre className={styles.diff} tabIndex={0} role="region" aria-labelledby={DIFF_LABEL_ID}>
            <code>{proposal.diff}</code>
          </pre>
        )}
      </Card>
    </div>
  );
}
