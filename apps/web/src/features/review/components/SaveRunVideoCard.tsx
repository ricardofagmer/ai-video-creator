'use client';

import { Alert, Button, Card, textLinkClassName } from '@studio/ui';
import { type SaveRunVideoResponse } from '@studio/shared/api';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { describeRunError } from '@/features/runs/run-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { browserReviewApi } from '../review-api';

interface SaveRunVideoCardProps {
  runId: string;
}

function presetHref(recipeRef: string): string {
  const [recipeId = '', version = ''] = recipeRef.split('@');
  return `/receitas/${encodeURIComponent(recipeId)}?versao=${encodeURIComponent(version)}`;
}

/** "Save video to preset": the run's final video becomes a catalog video listed on its preset page. */
export function SaveRunVideoCard({ runId }: SaveRunVideoCardProps): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.review.saveVideo;
  const [saved, setSaved] = useState<SaveRunVideoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(): Promise<void> {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      setSaved(await browserReviewApi.saveRunVideo(runId));
    } catch (caught) {
      setError(describeRunError(caught, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title={texts.title} description={texts.description}>
      <div className={layout.stack}>
        {error !== null && <Alert variant="error">{error}</Alert>}
        {saved !== null && (
          <Alert
            variant="success"
            actions={
              <>
                <Link href={presetHref(saved.recipeRef)} className={textLinkClassName()}>
                  {texts.openPreset}
                </Link>{' '}
                <Link href={`/catalogo/${encodeURIComponent(saved.assetId)}`} className={textLinkClassName()}>
                  {texts.openInCatalog}
                </Link>
              </>
            }
          >
            {texts.saved(`${saved.assetId}@${saved.version}`)}
          </Alert>
        )}
        <div className={layout.formFooter}>
          <Button type="button" variant="primary" loading={pending} loadingLabel={texts.saving} onClick={() => void save()}>
            {texts.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
