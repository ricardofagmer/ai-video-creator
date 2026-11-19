import { Alert, Card, CostMeter, Table, formatUsd, shortenHash, type TableColumn } from '@studio/ui';
import { type Binding } from '@studio/shared/recipes';
import { type RunFile, type StageRecord } from '@studio/shared/run-format';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { stageLabels } from '@/features/recipes/recipe-labels';

function HashText({ contentHash }: { contentHash: string }): ReactElement {
  return (
    <span className="mono" title={contentHash}>
      {shortenHash(contentHash)}
    </span>
  );
}

const stageColumns: readonly TableColumn<StageRecord>[] = [
  { key: 'stage', header: 'Etapa', rowHeader: true, render: (stage) => stageLabels[stage.stageId] },
  {
    key: 'estimate',
    header: 'Estimativa',
    align: 'end',
    render: (stage) => (stage.outcome.status === 'skipped' ? 'Pulada' : stage.estimate === null ? '—' : formatUsd(stage.estimate.usd)),
  },
];

/** Pinned versions are shown by ref and hash only; nothing here reads asset bytes (biometric rule). */
const bindingColumns: readonly TableColumn<Binding>[] = [
  { key: 'slot', header: 'Slot', rowHeader: true, render: (binding) => <span className="mono">{binding.slot}</span> },
  { key: 'ref', header: 'Ativo', render: (binding) => <span className="mono">{binding.ref}</span> },
  { key: 'hash', header: 'Hash', render: (binding) => <HashText contentHash={binding.contentHash} /> },
];

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
  const { plan } = run;
  if (plan === null) return null;
  return (
    <Card title="Plano resolvido" description={<span className="mono">{`${run.recipe.ref} · ${shortenHash(run.recipe.contentHash)}`}</span>}>
      <div className={layout.stack}>
        {plan.warning !== null && <Alert variant="warning">{plan.warning}</Alert>}
        <Table caption="Plano resolvido" hideCaption columns={stageColumns} rows={run.stages} rowKey={(stage) => stage.stageId} emptyText="Nenhuma etapa." />
        <Table
          caption="Ativos fixados"
          columns={bindingColumns}
          rows={run.recipe.definition.bindings}
          rowKey={(binding) => binding.slot}
          emptyText="Esta receita não fixa ativos."
        />
        {plan.risks.length > 0 && (
          <Alert variant="info" title="Riscos apontados">
            <ul>
              {plan.risks.map((risk, index) => (
                <li key={index}>{risk}</li>
              ))}
            </ul>
          </Alert>
        )}
        <CostMeter label="Custo da execução" spentUsd={run.totals.costUsd} limitUsd={run.limits.costPerRunUsd} estimateUsd={plan.totalEstimateUsd} />
      </div>
    </Card>
  );
}
