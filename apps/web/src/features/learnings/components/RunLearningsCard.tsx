import { Alert, Card } from '@studio/ui';
import type { ReactElement } from 'react';
import { getI18n } from '@/lib/i18n/server';
import { type RunLearningsData } from '../run-learnings.server';
import styles from '../learnings.module.css';
import { LearningNoteList } from './LearningNoteList';
import { LearningSaveForm } from './LearningSaveForm';

interface RunLearningsCardProps {
  runId: string;
  data: RunLearningsData;
}

/**
 * "Aprendizados" on the review screen (SPEC 0003 section 5.5): the notes this run already wrote
 * back, and the form to write one more onto a version it used. Notes are data, never instructions:
 * they reach later stage briefs inside delimited blocks, and no agent packet.
 */
export async function RunLearningsCard({ runId, data }: RunLearningsCardProps): Promise<ReactElement> {
  const { t } = await getI18n();
  const texts = t.runs.learnings;
  return (
    <Card title={texts.title} description={texts.description}>
      {data.kind === 'no-manifest' ? (
        <p className="caption">{texts.noManifest}</p>
      ) : (
        <div className={styles.stack}>
          <LearningNoteList notes={data.notes} showRef emptyText={texts.emptyForRun} />
          {data.biometricCount > 0 && (
            <Alert variant="info">
              {texts.biometricLeftOut(data.biometricCount)}
            </Alert>
          )}
          {data.unreadableCount > 0 && (
            <Alert variant="warning">
              {texts.unreadableLeftOut(data.unreadableCount)}
            </Alert>
          )}
          {data.targets.length > 0 ? (
            <LearningSaveForm runId={runId} targets={data.targets} />
          ) : (
            <p className="caption">{texts.noTargets}</p>
          )}
        </div>
      )}
    </Card>
  );
}
