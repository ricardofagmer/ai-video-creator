import { Box, Text } from 'ink';
import { type ReactElement } from 'react';
import { cliText } from '../i18n/messages.js';
import { runDetailLines } from '../output/run-text.js';
import { type RunSnapshot } from '../runs/run-reader.js';
import { SafeText } from './safe-text.js';

export interface RunDetailViewProps {
  snapshot: RunSnapshot | null;
}

/** The selected run, with the same lines `studio status <runId>` prints. */
export function RunDetailView({ snapshot }: RunDetailViewProps): ReactElement {
  if (snapshot === null) return <Text dimColor>{cliText().runs.dashboard.selectRun}</Text>;
  return (
    <Box flexDirection="column">
      {runDetailLines(snapshot).map((line, index) => (
        // Lines are positional output of one snapshot; the index is their stable identity here.
        <SafeText key={index}>{line}</SafeText>
      ))}
    </Box>
  );
}
