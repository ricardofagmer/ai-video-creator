'use client';

import { Alert, Card, CostMeter, Table, formatUsd, shortenHash, useI18n, type Locale, type TableColumn } from '@studio/ui';
import { type Binding } from '@studio/shared/recipes';
import { type RunFile, type StageRecord } from '@studio/shared/run-format';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';

function HashText({ contentHash }: { contentHash: string }): ReactElement {
  return (
    <span className="mono" title={contentHash}>
      {shortenHash(contentHash)}
    </span>
  );
}

function stageColumns(runs: WebMessages['runs'], locale: Locale): readonly TableColumn<StageRecord>[] {
  const t = runs.plan;
  return [
    { key: 'stage', header: t.stage, rowHeader: true, render: (stage) => runs.stages[stage.stageId] },
    {
      key: 'estimate',
      header: t.estimate,
      align: 'end',
      render: (stage) => (stage.outcome.status === 'skipped' ? t.skipped : stage.estimate === null ? '—' : formatUsd(stage.estimate.usd, locale)),
    },
  ];
}

/** Pinned versions are shown by ref and hash only; nothing here reads asset bytes (biometric rule). */
function bindingColumns(t: WebMessages['runs']['plan']): readonly TableColumn<Binding>[] {
  return [
    { key: 'slot', header: t.slot, rowHeader: true, render: (binding) => <span className="mono">{binding.slot}</span> },
    { key: 'ref', header: t.asset, render: (binding) => <span className="mono">{binding.ref}</span> },
    { key: 'hash', header: t.hash, render: (binding) => <HashText contentHash={binding.contentHash} /> },
  ];
}

interface RunPlanCardProps {
  run: RunFile;
}

/**
 * design/telas/07 "Plano resolvido": stages with their estimate, the recipe's pinned versions with
 * hash and the run cost meter. C3 does not say which binding feeds which stage, so stages and
 * pinned assets are two tables instead of the wireframe's one. Risks and the fallback warning are
 * engine and Planner text, rendered as React text.
 */
export function RunPlanCard({ run }: RunPlanCardProps): ReactElement | null {
  const { runs } = useWebMessages();
  const { locale } = useI18n();
  const t = runs.plan;
  const { plan } = run;
  if (plan === null) return null;
  return (
    <Card title={t.title} description={<span className="mono">{`${run.recipe.ref} · ${shortenHash(run.recipe.contentHash)}`}</span>}>
      <div className={layout.stack}>
        {plan.warning !== null && <Alert variant="warning">{plan.warning}</Alert>}
        <Table caption={t.title} hideCaption columns={stageColumns(runs, locale)} rows={run.stages} rowKey={(stage) => stage.stageId} emptyText={t.noStages} />
        <Table
          caption={t.pinnedAssets}
          columns={bindingColumns(t)}
          rows={run.recipe.definition.bindings}
          rowKey={(binding) => binding.slot}
          emptyText={t.noPinnedAssets}
        />
        {plan.risks.length > 0 && (
          <Alert variant="info" title={t.risks}>
            <ul>
              {plan.risks.map((risk, index) => (
                <li key={index}>{risk}</li>
              ))}
            </ul>
          </Alert>
        )}
        <CostMeter label={t.runCost} spentUsd={run.totals.costUsd} limitUsd={run.limits.costPerRunUsd} estimateUsd={plan.totalEstimateUsd} />
      </div>
    </Card>
  );
}
