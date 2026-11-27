import { Box, Text, useApp, useInput } from 'ink';
import { type ReactElement } from 'react';
import { cliText } from '../i18n/messages.js';
import { RunDetailView } from './run-detail-view.js';
import { RunListView } from './run-list-view.js';
import { SafeText } from './safe-text.js';
import { useDashboardState, type ControlRequester } from './use-dashboard-state.js';

export interface DashboardProps {
  runsRoot: string;
  dataHomeRoot: string;
  requestControl: ControlRequester;
}

/**
 * Full-screen dashboard (R1-21): the newest runs, the selected run's stages and live activity,
 * and pause/stop/resume of the selected run. Reading needs only the run folders.
 */
export function Dashboard({ runsRoot, dataHomeRoot, requestControl }: DashboardProps): ReactElement {
  const { exit } = useApp();
  const model = useDashboardState(runsRoot, requestControl);

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit();
    else if (key.upArrow) model.moveSelection(-1);
    else if (key.downArrow) model.moveSelection(1);
    else if (input === 'p') model.requestControl('pause');
    else if (input === 's') model.requestControl('stop');
    else if (input === 'r') model.requestControl('resume');
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>EngineOS Video Creator</Text>
        <SafeText dimColor>{dataHomeRoot}</SafeText>
      </Box>
      {model.loadError === null ? null : <SafeText color="red">{model.loadError}</SafeText>}
      <Box marginTop={1}>
        <RunListView recent={model.recent} selectedIndex={model.selectedIndex} />
      </Box>
      <Box marginTop={1} borderStyle="single" paddingX={1}>
        <RunDetailView snapshot={model.selected} />
      </Box>
      {model.notice === null ? null : <SafeText color={model.notice.tone === 'error' ? 'red' : 'green'}>{model.notice.text}</SafeText>}
      <Text dimColor>{cliText().runs.dashboard.keyHelp}</Text>
    </Box>
  );
}
