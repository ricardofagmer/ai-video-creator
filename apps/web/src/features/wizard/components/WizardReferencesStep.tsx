'use client';

import { AssetRefSchema, parseAssetRef } from '@studio/shared/catalog';
import { Alert, Card } from '@studio/ui';
import { type ReactElement } from 'react';
import { RunReferencesPicker } from '@/features/runs/components/RunReferencesPicker';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../wizard.module.css';
import { WizardNewReferenceDialog } from './WizardNewReferenceDialog';
import { WizardReferenceItem } from './WizardReferenceItem';

interface WizardReferencesStepProps {
  references: readonly string[];
  onChange: (refs: string[]) => void;
  /** Cart items preselected on a fresh start. */
  cartReferencesAdded: number;
}

/** Step 1 "Referências": the new-run picker, then each chosen reference with its analysis state. */
export function WizardReferencesStep({ references, onChange, cartReferencesAdded }: WizardReferencesStepProps): ReactElement {
  const t = useWebMessages();
  const texts = t.wizard.references;
  const chosen = references.filter((ref) => AssetRefSchema.safeParse(ref).success);
  return (
    <>
      <Card
        title={texts.card}
        description={texts.description}
        actions={
          <WizardNewReferenceDialog selected={references} onChange={onChange} />
        }
      >
        {cartReferencesAdded > 0 && <Alert variant="info">{t.cart.run.referencesAdded(cartReferencesAdded)}</Alert>}
        <RunReferencesPicker selected={references} onChange={onChange} disabled={false} />
      </Card>
      <Card title={texts.chosenTitle}>
        {chosen.length === 0 ? (
          <p className="caption">{texts.none}</p>
        ) : (
          <ul className={styles.rows}>
            {chosen.map((ref) => {
              const { assetId, version } = parseAssetRef(ref);
              return (
                <li key={ref}>
                  <WizardReferenceItem assetId={assetId} version={version} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
