import { Card, textLinkClassName } from '@studio/ui';
import { type CurationView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import styles from '../curations.module.css';

type CurationProposal = NonNullable<CurationView['proposal']>;

const DIFF_LABEL_ID = 'curadoria-diferenca-titulo';

function lineCount(count: number): string {
  return count === 1 ? '1 linha' : `${count} linhas`;
}

/**
 * The proposal of a `proposed` curation (SPEC 0005 section 5.9). Every field is model-written, so
 * each one is a React text node: no markup is ever parsed from it (section 6, C5-AC-20). The diff
 * is a unified text diff inside `<pre><code>`, scrollable and reachable by keyboard.
 */
export function CurationProposalDetails({ proposal }: { proposal: CurationProposal }): ReactElement {
  const { addedLines, removedLines } = proposal.diffStats;
  return (
    <div className={layout.stackLarge}>
      <Card title="Proposta">
        <dl className={styles.fields}>
          <div>
            <dt>Resumo da mudança</dt>
            <dd className={styles.plainText}>{proposal.changeSummary}</dd>
          </div>
          <div>
            <dt>Motivo</dt>
            <dd className={styles.plainText}>{proposal.reason}</dd>
          </div>
          <div>
            <dt>Efeito esperado</dt>
            <dd className={styles.plainText}>{proposal.expectedEffect}</dd>
          </div>
          <div>
            <dt>Execuções usadas como evidência</dt>
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
      <Card title="Diferença do texto" description={`${lineCount(addedLines)} a mais, ${lineCount(removedLines)} a menos.`}>
        <p id={DIFF_LABEL_ID} className="visually-hidden">
          Diferença entre o texto atual e o proposto
        </p>
        {proposal.diff === '' ? (
          <p className="caption">Sem diferença para mostrar.</p>
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
