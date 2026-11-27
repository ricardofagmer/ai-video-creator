'use client';

import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { Alert, Button, Card, EmptyState, Spinner, useI18n } from '@studio/ui';
import { useEffect, useState, type ReactElement } from 'react';
import { listedAssetStatuses } from '@/features/catalog/discontinue-asset';
import { describeApiError } from '@/features/common/api-error-text';
import layout from '@/features/common/layout.module.css';
import { RunImageCategoryTabs } from '@/features/runs/components/RunImageCategoryTabs';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';
import { type PipelineItem } from '../wizard-draft';
import { MAX_RUN_ITEMS, kindsOfPipelineTab, pipelineTabs, versionInPipelineTab, type PipelineTab } from '../wizard-pipeline';
import styles from '../wizard.module.css';
import { WizardLibraryCard } from './WizardLibraryCard';

interface WizardPipelineStepProps {
  items: readonly PipelineItem[];
  /** The references chosen in step 1; they share the run's 50 refs with these items. */
  referenceCount: number;
  onChange: (items: PipelineItem[]) => void;
}

type CatalogList = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'done'; versions: AssetVersionView[] };

const PANEL_ID = 'wizard-pipeline-panel';

function isPipelineTab(key: string): key is PipelineTab {
  return (pipelineTabs as readonly string[]).includes(key);
}

/**
 * Step 2 "Add to pipeline": catalog sites, skills, templates, prompts, AI models, music and brand
 * kits, one tab each, added to the run beside the references so the writer and the director read them.
 */
export function WizardPipelineStep({ items, referenceCount, onChange }: WizardPipelineStepProps): ReactElement {
  const t = useWebMessages();
  const { locale } = useI18n();
  const texts = t.wizard.pipeline;
  const [tab, setTab] = useState<PipelineTab>('sites');
  const [list, setList] = useState<CatalogList>({ status: 'loading' });
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const full = referenceCount + items.length >= MAX_RUN_ITEMS;
  const addedRefs = items.map((item) => item.ref);

  useEffect(() => {
    let current = true;
    setList({ status: 'loading' });
    browserStudioClient
      .searchAssets({ kinds: [...kindsOfPipelineTab(tab)], statuses: listedAssetStatuses, sensitivity: 'exclude-biometric', limit: 100 })
      .then((page) => {
        if (current) setList({ status: 'done', versions: page.items.filter((version) => versionInPipelineTab(tab, version)) });
      })
      .catch((error: unknown) => {
        if (current) setList({ status: 'failed', message: describeApiError(error, t) });
      });
    return () => {
      current = false;
    };
  }, [tab, t]);

  function add(version: AssetVersionView): void {
    const ref = formatAssetRef({ assetId: version.id, version: version.version });
    if (full || addedRefs.includes(ref)) return;
    setNames((previous) => ({ ...previous, [ref]: version.name }));
    onChange([...items, { ref, kind: version.kind }]);
  }

  function remove(ref: string): void {
    onChange(items.filter((item) => item.ref !== ref));
  }

  return (
    <>
      <Card title={texts.card} description={texts.description}>
        <p className="caption">{texts.pinNote}</p>
        {full && <Alert variant="info">{texts.full}</Alert>}
        <RunImageCategoryTabs
          label={texts.tabsLabel}
          tabs={pipelineTabs.map((key) => ({ key, label: texts.tabs[key] }))}
          selected={tab}
          panelId={PANEL_ID}
          onSelect={(key) => {
            if (isPipelineTab(key)) setTab(key);
          }}
        />
        <div id={PANEL_ID} role="tabpanel" className={layout.stack}>
          {list.status === 'loading' && <Spinner size="sm" label={texts.loading} />}
          {list.status === 'failed' && <Alert variant="error">{list.message}</Alert>}
          {list.status === 'done' && list.versions.length === 0 && <EmptyState title={texts.empty} />}
          {list.status === 'done' && list.versions.length > 0 && (
            <ul className={layout.cardGrid}>
              {list.versions.map((version) => {
                const ref = formatAssetRef({ assetId: version.id, version: version.version });
                return (
                  <li key={ref}>
                    <WizardLibraryCard version={version} added={addedRefs.includes(ref)} full={full} onAdd={() => add(version)} t={t} locale={locale} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
      <Card title={texts.chosenTitle}>
        {items.length === 0 ? (
          <p className="caption">{texts.none}</p>
        ) : (
          <ul className={styles.rows}>
            {items.map((item) => (
              <li key={item.ref} className={styles.pipelineRow}>
                <span>
                  <strong>{names[item.ref] ?? item.ref}</strong> <span className="caption">{t.catalog.kinds[item.kind]}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => remove(item.ref)}>
                  {texts.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
