'use client';

import { Alert, Badge, Card, useI18n } from '@studio/ui';
import { type RunPublicationLine } from '@studio/shared/platforms';
import type { ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
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
  const t = useWebMessages();
  const { locale } = useI18n();
  const texts = t.publishing.leftTheMachine;
  const items = leftTheMachineItems(egress.status === 'ready' ? egress.entries : [], lines ?? [], t.publishing, locale);
  return (
    <Card title={texts.title} description={texts.description}>
      <div className={styles.leftTheMachine}>
        {egress.status === 'unavailable' && (
          <Alert variant="warning">{texts.manifestUnreadable}</Alert>
        )}
        {lines === null && <Alert variant="warning">{texts.linesUnreadable}</Alert>}
        {items.length === 0 ? (
          <p className="caption">{texts.empty}</p>
        ) : (
          <ol className={styles.leftTheMachineList}>
            {items.map((item) => (
              <li key={item.key} className={styles.leftTheMachineItem}>
                <span lang={item.lang}>{item.text}</span>
                {item.mock && <Badge tone="info">{t.platforms.mockBadge}</Badge>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
