'use client';

import { type ReferenceAnalysisView } from '@studio/shared/api';
import { type ReferenceStyleAnalysis } from '@studio/shared/agents';
import { Alert, Badge, Button, Card, DescriptionList, Spinner, buttonClassName, type DescriptionItem } from '@studio/ui';
import Link from 'next/link';
import { type ReactElement, type ReactNode } from 'react';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { useReferenceAnalysis } from '../hooks/useReferenceAnalysis';
import { analysisCanBeRequested, referenceAnalysisDisplayOf, type ReferenceAnalysisDisplay } from '../reference-analysis-state';

export interface ReferenceAnalysisCardProps {
  assetId: string;
  version: number;
  /** The existing new-version form, where the owner attaches the video file to a link-only reference; null on a screen that must not navigate (the wizard). */
  newVersionHref: string | null;
  initialView: ReferenceAnalysisView | null;
  /** Why the server could not read the analysis; shown while there is no view. */
  initialError: string | null;
}

/**
 * "Análise da IA" of a saved video reference (guided-creation spec section 4). The notes are the
 * AI's, labelled as such and rendered as plain text: a video can carry hostile on-screen text, so
 * nothing here is HTML. The owner's own notes stay in the details card, untouched.
 */
export function ReferenceAnalysisCard({ assetId, version, newVersionHref, initialView, initialError }: ReferenceAnalysisCardProps): ReactElement {
  const t = useWebMessages();
  const texts = t.catalog.referenceAnalysis;
  const live = useReferenceAnalysis({ assetId, version, initialView });
  const display = live.view === null ? null : referenceAnalysisDisplayOf(live.view);
  const errorText = live.error !== null ? describeApiError(live.error, t) : live.view === null ? initialError : null;
  const canRequest = display !== null && analysisCanBeRequested(display);
  const requestLabel = display?.kind === 'not-yet' ? texts.analyse : texts.reanalyse;

  const actions: ReactNode =
    display === null ? (
      <Button variant="secondary" size="sm" loading={live.busy} onClick={live.reload}>
        {t.common.retry}
      </Button>
    ) : canRequest ? (
      <Button variant="secondary" size="sm" loading={live.busy} loadingLabel={texts.analysing} onClick={live.request}>
        {requestLabel}
      </Button>
    ) : undefined;

  return (
    <Card
      title={texts.title}
      description={display?.kind === 'done' ? texts.byAi : undefined}
      actions={
        display?.kind === 'done' && display.mock ? (
          <>
            <Badge tone="info">{texts.mock}</Badge>
            {actions}
          </>
        ) : (
          actions
        )
      }
    >
      <div className={layout.stack}>
        {errorText !== null && <Alert variant="error">{live.view === null ? texts.readFailed(errorText) : errorText}</Alert>}
        {display !== null && <AnalysisBody display={display} newVersionHref={newVersionHref} waitedTooLong={live.waitedTooLong} t={t} />}
      </div>
    </Card>
  );
}

interface AnalysisBodyProps {
  display: ReferenceAnalysisDisplay;
  newVersionHref: string | null;
  waitedTooLong: boolean;
  t: WebMessages;
}

function AnalysisBody({ display, newVersionHref, waitedTooLong, t }: AnalysisBodyProps): ReactElement {
  const texts = t.catalog.referenceAnalysis;
  switch (display.kind) {
    case 'unavailable':
      if (display.reason === 'link-only') {
        return (
          <div className={layout.stack}>
            <p>{texts.linkOnly}</p>
            {newVersionHref !== null && (
              <div>
                <Link href={newVersionHref} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
                  {texts.attachFile}
                </Link>
              </div>
            )}
          </div>
        );
      }
      return <p className="caption">{display.reason === 'biometric' ? texts.biometric : texts.notAVideo}</p>;
    case 'not-yet':
      return <p className="caption">{texts.notYet}</p>;
    case 'waiting':
      return waitedTooLong ? (
        <Alert variant="info">{texts.waitedTooLong}</Alert>
      ) : (
        <div role="status" className={layout.row}>
          <Spinner size="sm" decorative />
          <span>{texts.waiting}</span>
        </div>
      );
    case 'failed':
      return <Alert variant="warning">{display.code === null ? texts.noResult : t.catalog.assetJobErrors[display.code]}</Alert>;
    case 'done':
      return (
        <div className={layout.stack}>
          <DescriptionList items={analysisItems(display.analysis, t)} />
          {display.frames !== null && <p className="caption">{texts.frames(display.frames)}</p>}
        </div>
      );
  }
}

function listOf(entries: readonly string[]): ReactNode {
  return (
    <ul>
      {entries.map((entry, index) => (
        // The AI's lines can repeat; their order is the identity.
        <li key={index}>{entry}</li>
      ))}
    </ul>
  );
}

/** The analysis fields in reading order; empty text fields are left out instead of shown blank. */
function analysisItems(analysis: ReferenceStyleAnalysis, t: WebMessages): DescriptionItem[] {
  const fields = t.catalog.referenceAnalysis.fields;
  const items: (DescriptionItem | null)[] = [
    { term: fields.summary, description: analysis.summary },
    analysis.hook === '' ? null : { term: fields.hook, description: analysis.hook },
    analysis.pacing === '' ? null : { term: fields.pacing, description: analysis.pacing },
    analysis.shots.length === 0 ? null : { term: fields.shots, description: listOf(analysis.shots) },
    analysis.onScreenText === '' ? null : { term: fields.onScreenText, description: analysis.onScreenText },
    analysis.visualStyle === '' ? null : { term: fields.visualStyle, description: analysis.visualStyle },
    { term: fields.promptNotes, description: listOf(analysis.promptNotes) },
    analysis.cautions.length === 0 ? null : { term: fields.cautions, description: listOf(analysis.cautions) },
  ];
  return items.filter((item): item is DescriptionItem => item !== null);
}
