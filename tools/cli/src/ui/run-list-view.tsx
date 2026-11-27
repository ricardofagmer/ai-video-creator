import { Box, Text } from 'ink';
import { type ReactElement } from 'react';
import { cliText } from '../i18n/messages.js';
import { runListHeader, runListMoreLine, runListRow } from '../output/run-text.js';
import { type RecentRuns } from '../runs/run-reader.js';
import { SafeText } from './safe-text.js';

export interface RunListViewProps {
  recent: RecentRuns | null;
  selectedIndex: number;
}

/** Same rows as `studio status`, with the selected run highlighted. */
export function RunListView({ recent, selectedIndex }: RunListViewProps): ReactElement {
  if (recent === null) return <Text dimColor>{cliText().runs.dashboard.loading}</Text>;
  if (recent.results.length === 0) return <Text>{cliText().runs.list.empty}</Text>;
  const more = runListMoreLine(recent);
  return (
    <Box flexDirection="column">
      <Text bold>{`  ${runListHeader()}`}</Text>
      {recent.results.map((result, index) => {
        const isSelected = index === selectedIndex;
        return (
          <SafeText key={result.status === 'read' ? result.snapshot.runId : result.runId} inverse={isSelected}>
            {`${isSelected ? '> ' : '  '}${runListRow(result)}`}
          </SafeText>
        );
      })}
      {more === null ? null : <Text dimColor>{more}</Text>}
    </Box>
  );
}
