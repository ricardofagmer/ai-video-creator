import { Alert, Card } from '@studio/ui';
import type { ReactElement } from 'react';
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
export function RunLearningsCard({ runId, data }: RunLearningsCardProps): ReactElement {
  return (
    <Card
      title="Aprendizados"
      description="Uma lição desta execução vira uma nota na versão do catálogo e entra nos briefings das próximas execuções que usarem essa versão."
    >
      {data.kind === 'no-manifest' ? (
        <p className="caption">O manifesto desta execução não pôde ser lido, então não há versões para anotar.</p>
      ) : (
        <div className={styles.stack}>
          <LearningNoteList notes={data.notes} showRef emptyText="Nenhum aprendizado salvo a partir desta execução." />
          {data.biometricCount > 0 && (
            <Alert variant="info">
              {data.biometricCount === 1
                ? 'Uma versão biométrica usada nesta execução não aceita aprendizados e ficou de fora.'
                : `${data.biometricCount} versões biométricas usadas nesta execução não aceitam aprendizados e ficaram de fora.`}
            </Alert>
          )}
          {data.unreadableCount > 0 && (
            <Alert variant="warning">
              {data.unreadableCount === 1
                ? 'Uma versão usada nesta execução não pôde ser lida no catálogo e ficou de fora.'
                : `${data.unreadableCount} versões usadas nesta execução não puderam ser lidas no catálogo e ficaram de fora.`}
            </Alert>
          )}
          {data.targets.length > 0 ? (
            <LearningSaveForm runId={runId} targets={data.targets} />
          ) : (
            <p className="caption">Nenhuma versão desta execução aceita aprendizados.</p>
          )}
        </div>
      )}
    </Card>
  );
}
