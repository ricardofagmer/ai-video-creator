'use client';

import { Alert, Button, Card, FormField, Input, Select, textLinkClassName } from '@studio/ui';
import { type PromoteFromRunResponse } from '@studio/shared/api';
import { AssetIdSchema } from '@studio/shared/catalog';
import Link from 'next/link';
import { useState, type FormEvent, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { describeRunError } from '@/features/runs/run-error-text';
import { browserReviewApi } from '../review-api';

interface PromoteOutput {
  name: string;
  path: string;
}

interface PromoteFromRunCardProps {
  runId: string;
  /** `manifest.outputs`: the files the run recorded with a hash. */
  outputs: readonly PromoteOutput[];
}

const ARTIFACT_ID = 'promover-arquivo';
const ASSET_ID = 'promover-ativo';

/**
 * Optional "Promover ao catálogo" (PRD 5.3, A14): a recorded run output becomes a new version
 * of a catalog asset. The api refuses biometric material (`promote-biometric-refused`) and
 * unconfirmed sensitivity (`promote-sensitivity-unknown`); those refusals are shown in pt-BR.
 */
export function PromoteFromRunCard({ runId, outputs }: PromoteFromRunCardProps): ReactElement {
  const [artifactPath, setArtifactPath] = useState(outputs[0]?.path ?? '');
  const [assetId, setAssetId] = useState('');
  const [assetError, setAssetError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<PromoteFromRunResponse | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const parsedId = AssetIdSchema.safeParse(assetId.trim());
    if (!parsedId.success) {
      setAssetError('Use o id de um ativo do catálogo.');
      document.getElementById(ASSET_ID)?.focus();
      return;
    }
    setAssetError(null);
    setServerError(null);
    setPromoted(null);
    setPending(true);
    try {
      setPromoted(await browserReviewApi.promoteFromRun(runId, { artifactPath, assetId: parsedId.data }));
    } catch (error) {
      setServerError(describeRunError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Promover ao catálogo" description="Opcional. Um arquivo desta execução vira uma nova versão de um ativo do catálogo.">
      <form className={layout.stack} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {serverError !== null && <Alert variant="error">{serverError}</Alert>}
        {promoted !== null && (
          <Alert
            variant="success"
            actions={
              <Link href={`/catalogo/${encodeURIComponent(promoted.assetId)}`} className={textLinkClassName()}>
                Abrir no catálogo
              </Link>
            }
          >
            {`Nova versão criada: ${promoted.assetId}@${promoted.version}.`}
          </Alert>
        )}
        <FormField id={ARTIFACT_ID} label="Arquivo da execução" disabled={pending}>
          {({ invalid, ...control }) => (
            <Select
              {...control}
              invalid={invalid}
              options={outputs.map((output) => ({ value: output.path, label: `${output.name} · ${output.path}` }))}
              value={artifactPath}
              onChange={(event) => setArtifactPath(event.currentTarget.value)}
            />
          )}
        </FormField>
        <FormField id={ASSET_ID} label="Ativo de destino" help="Id do ativo do catálogo que recebe a nova versão." error={assetError ?? undefined} disabled={pending}>
          {({ invalid, ...control }) => (
            <Input {...control} invalid={invalid} maxLength={120} value={assetId} onChange={(event) => setAssetId(event.currentTarget.value)} />
          )}
        </FormField>
        <div className={layout.formFooter}>
          <Button type="submit" variant="secondary" loading={pending} loadingLabel="Promovendo…">
            Promover
          </Button>
        </div>
      </form>
    </Card>
  );
}
