import { Box, Text } from 'ink';
import { type ReactElement } from 'react';
import { RUN_LIST_HEADER, runListRow } from '../output/run-text.js';
import { type RecentRuns } from '../runs/run-reader.js';

export interface RunListViewProps {
  recent: RecentRuns | null;
  selectedIndex: number;
}

/** Same rows as `studio status`, with the selected run highlighted. */
export function RunListView({ recent, selectedIndex }: RunListViewProps): ReactElement {
  if (recent === null) return <Text dimColor>Lendo execuções...</Text>;
  if (recent.results.length === 0) return <Text>Nenhuma execução ainda. Comece com "studio run".</Text>;
  return (
    <Box flexDirection="column">
      <Text bold>{`  ${RUN_LIST_HEADER}`}</Text>
      {recent.results.map((result, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Text key={result.status === 'read' ? result.snapshot.runId : result.runId} inverse={isSelected}>
            {`${isSelected ? '> ' : '  '}${runListRow(result)}`}
          </Text>
        );
      })}
      {recent.total > recent.results.length ? <Text dimColor>{`Mostrando ${recent.results.length} de ${recent.total} execuções.`}</Text> : null}
    </Box>
  );
}
