'use client';

import { type AssetVersionView, type ReferenceAnalysisView } from '@studio/shared/api';
import { Alert, Spinner, textLinkClassName } from '@studio/ui';
import Link from 'next/link';
import { useEffect, useState, type ReactElement } from 'react';
import { ReferenceAnalysisCard } from '@/features/catalog/components/ReferenceAnalysisCard';
import { describeApiError } from '@/features/common/api-error-text';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../wizard.module.css';

interface WizardReferenceItemProps {
  assetId: string;
  version: number;
}

type ItemState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; item: AssetVersionView; analysis: { view: ReferenceAnalysisView | null; error: string | null } | null };

/** Saved video references get the "Análise da IA" card, as on the catalog page (spec section 4). */
function isVideoReference(version: AssetVersionView): boolean {
  return version.kind === 'reference' && version.details.subKind === 'video';
}

/**
 * One chosen reference: its name linked to the catalog item and, for a video, whether its AI
 * analysis is ready (the catalog's own card, which polls while the analysis runs).
 */
export function WizardReferenceItem({ assetId, version }: WizardReferenceItemProps): ReactElement {
  const t = useWebMessages();
  const texts = t.wizard.references;
  const [state, setState] = useState<ItemState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const item = await browserStudioClient.getAssetVersion(assetId, version);
        if (!isVideoReference(item)) {
          if (!cancelled) setState({ status: 'ready', item, analysis: null });
          return;
        }
        let analysis: { view: ReferenceAnalysisView | null; error: string | null };
        try {
          analysis = { view: await browserStudioClient.getReferenceAnalysis(assetId, version), error: null };
        } catch (error) {
          // The card shows the failure and can read the analysis again.
          analysis = { view: null, error: describeApiError(error, t) };
        }
        if (!cancelled) setState({ status: 'ready', item, analysis });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `t` only words the error; reading again when the language changes is not needed.
  }, [assetId, version]);

  const catalogHref = `/catalogo/${encodeURIComponent(assetId)}?versao=${version}`;
  const ref = `${assetId}@${version}`;

  if (state.status === 'loading') return <Spinner size="sm" label={texts.loading} />;
  if (state.status === 'failed') {
    return (
      <Alert variant="warning">
        <span className="mono">{ref}</span> {texts.loadFailed}
      </Alert>
    );
  }
  const { item, analysis } = state;
  return (
    <div className={styles.referenceItem}>
      <span className={styles.rowName}>
        <Link href={catalogHref} className={textLinkClassName()} aria-label={texts.openItem(item.name)}>
          {item.name}
        </Link>
        <span className="mono caption">{ref}</span>
      </span>
      {analysis === null ? (
        <p className="caption">{texts.notVideo}</p>
      ) : (
        <ReferenceAnalysisCard
          assetId={assetId}
          version={version}
          newVersionHref={`/catalogo/novo?de=${encodeURIComponent(assetId)}&versao=${version}`}
          initialView={analysis.view}
          initialError={analysis.error}
        />
      )}
    </div>
  );
}
