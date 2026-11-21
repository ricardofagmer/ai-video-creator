import { Alert, Badge, Card } from '@studio/ui';
import { type RunPublicationLine } from '@studio/shared/platforms';
import type { ReactElement } from 'react';
import { MOCK_BADGE_TEXT } from '@/features/platforms/platform-labels';
import { leftTheMachineItems } from '../left-the-machine';
import styles from '../publishing.module.css';
import { type ManifestEgressRead } from '../run-publish-data';

interface LeftTheMachineCardProps {
  egress: ManifestEgressRead;
  /** The run's `publications.jsonl` lines from the publish view; null when it could not be read. */
  lines: readonly RunPublicationLine[] | null;
}

/**
 * "O que saiu da máquina" (SPEC 0007 section 5.4, AC 49, PRD 12): `manifest.json.egress`, then
 * what the studio sent to a platform after approval, with the confirmed biometric refs. Every line
 * is a text node; none carries a title, caption, tag, URL, path or account label.
 */
export function LeftTheMachineCard({ egress, lines }: LeftTheMachineCardProps): ReactElement {
  const items = leftTheMachineItems(egress.status === 'ready' ? egress.entries : [], lines ?? []);
  return (
    <Card title="O que saiu da máquina" description="Cada envio para fora do Mac: provedores durante a execução e plataformas depois da aprovação.">
      <div className={styles.leftTheMachine}>
        {egress.status === 'unavailable' && (
          <Alert variant="warning">O manifesto (manifest.json) não pôde ser lido, então os envios aos provedores não aparecem aqui.</Alert>
        )}
        {lines === null && <Alert variant="warning">Não foi possível ler os envios às plataformas.</Alert>}
        {items.length === 0 ? (
          <p className="caption">Nada saiu da máquina.</p>
        ) : (
          <ol className={styles.leftTheMachineList}>
            {items.map((item) => (
              <li key={item.key} className={styles.leftTheMachineItem}>
                <span>{item.text}</span>
                {item.mock && <Badge tone="info">{MOCK_BADGE_TEXT}</Badge>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
