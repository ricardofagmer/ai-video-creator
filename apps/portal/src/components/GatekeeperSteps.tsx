'use client';

import type { ReactElement } from 'react';
import { usePortalMessages } from '@/messages';
import styles from './portal.module.css';

/**
 * First launch of an ad hoc signed app (vetting 0006 section 3 items 3 to 5): System Settings >
 * Privacy & Security > Open Anyway. Control-click no longer overrides Gatekeeper since macOS 15,
 * so it is never mentioned.
 */
export function GatekeeperSteps(): ReactElement {
  const t = usePortalMessages();
  const { steps } = t.downloads.gatekeeper;
  return (
    <div className={styles.stack}>
      <h3 className="heading-3">{t.downloads.gatekeeper.title}</h3>
      <p className={`body-sm ${styles.paragraph}`}>{t.downloads.gatekeeper.intro}</p>
      <ol className={`body-sm ${styles.steps}`}>
        <li>{steps.drag}</li>
        <li>{steps.firstOpen}</li>
        <li>{steps.settings}</li>
        <li>{steps.password}</li>
        <li>{steps.later}</li>
      </ol>
    </div>
  );
}
