#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { executeCommand, printHelpDone, printUsageFailure } from './cli/execute';
import { approveCommand, previewCommand } from './commands/review';
import { captureCommand } from './commands/capture';
import { hookCommand } from './commands/hook';
import { initCommand } from './commands/init';
import { listCommand, retryCommand, statusCommand } from './commands/inspect';
import { registerMediaCommands } from './commands/media/media-cli';
import { narrateCommand } from './commands/narrate';
import { qaCommand } from './commands/qa';
import { renderCommand } from './commands/render';
import { validateCommand } from './commands/validate';
import { loadEnvironment } from './config/env';

const USAGE = `
ace - toolbox for the AI Creator Engine wizard (fagmer-video-producer).

Flow:
  ace init --date 2026-11-16 --slot 1 --topic "Meeting notes with AI" --pillar TOOL_DEMO --template TOOL_DEMO
  (Claude writes research.json)  ace validate <run> research
  (Claude writes claims.json)    ace validate <run> verify
  (Claude writes script.json)    ace validate <run> script
  ace capture <run>   ace narrate <run>   ace render <run>
  (Claude writes editorial.json) ace qa <run>
  ace preview <run>   ace approve <run> --decision APPROVED --reviewer <name> --checklist claimsVerified=true,...

<run> is a runId under ACE_RUNS_DIR (default runs/) or a path to a run folder.
Providers: PROVIDER_VOICE / PROVIDER_MEDIA = mock (default) | live, read from <repo>/.env.
Exit codes: 0 ok, 2 blocked (run moved to BLOCKED), 1 failed or rejected input.
The last stdout line is always JSON: {"ok","runId","state","next"}. Progress goes to stderr.
Nothing is ever posted to TikTok.
`;

function run(handler: Parameters<typeof executeCommand>[1]): Promise<void> {
  return executeCommand(loadEnvironment, handler);
}

function buildProgram(): Command {
  const program = new Command('ace').description('AI Creator Engine toolbox').addHelpText('beforeAll', USAGE).exitOverride();

  program
    .command('init')
    .description('create runs/<date>-s<slot>-<slug>/run.json in RESEARCH')
    .requiredOption('--date <yyyy-mm-dd>', 'production date')
    .requiredOption('--slot <1-4>', 'daily slot')
    .requiredOption('--topic <text>', 'topic seed')
    .requiredOption('--pillar <pillar>', 'TOOL_DEMO | AUTOMATION_WORKFLOW | AI_COMPARISON | VERIFIED_NEWS | PRODUCTIVITY_EXPERIMENT')
    .requiredOption('--template <template>', 'TOOL_DEMO | AI_BATTLE | AUTOMATION_BLUEPRINT')
    .option('--channel <id>', 'channel id (default ACE_CHANNEL_ID or "default")')
    .action((options: unknown) => run((context) => initCommand(context, options)));

  program
    .command('validate')
    .description('validate a Claude-written manifest and advance the state')
    .argument('<run>', 'runId or run folder path')
    .argument('<stage>', 'research | verify | script')
    .action((runArgument: string, stage: string) => run((context) => validateCommand(context, runArgument, stage)));

  const stageCommands = [
    ['capture', 'capture or generate one asset per scene -> assets.json', captureCommand],
    ['narrate', 'synthesise narration with word and scene timings -> narration.json', narrateCommand],
    ['render', 'render video.mp4 and thumbnail.png with @ace/video -> render.json', renderCommand],
    ['qa', 'technical checks + editorial.json -> qa.json; pass moves to REVIEW', qaCommand],
    ['preview', '720x1280 review copy under 12 MB -> preview.mp4', previewCommand],
    ['status', 'print state, reason, costs, files and next step', statusCommand],
    ['retry', 'move a FAILED run back to the state its failed stage runs in', retryCommand],
  ] as const;
  for (const [name, description, handler] of stageCommands) {
    program
      .command(name)
      .description(description)
      .argument('<run>', 'runId or run folder path')
      .action((runArgument: string) => run((context) => handler(context, runArgument)));
  }

  program
    .command('approve')
    .description('record the human review decision (REVIEW only); never posts anything')
    .argument('<run>', 'runId or run folder path')
    .requiredOption('--decision <decision>', 'APPROVED | REJECTED')
    .requiredOption('--reviewer <name>', 'who reviewed the preview')
    .option('--reason <text>', 'required for REJECTED')
    .requiredOption('--checklist <items>', 'k=v pairs for the 8 publish-review items, comma-separated')
    .action((runArgument: string, options: unknown) => run((context) => approveCommand(context, runArgument, options)));

  program
    .command('hook')
    .description('build a 20-45 s hook video, cover and carousel into out/hooks/<id>-<lang>/ (no run, never posts)')
    .argument('<id>', 'storyboard id, e.g. c01')
    .requiredOption('--lang <lang>', 'pt | en')
    .option('--voice <mode>', 'draft (macOS say, free) | live (ElevenLabs, needs .env key)', 'draft')
    .action((id: string, options: unknown) => run((context) => hookCommand(context, id, options)));

  program
    .command('list')
    .description('list runs under ACE_RUNS_DIR')
    .action(() => run((context) => listCommand(context)));

  registerMediaCommands(program, run);

  return program;
}

const helpCodes = new Set(['commander.helpDisplayed', 'commander.help', 'commander.version']);

async function main(): Promise<void> {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (helpCodes.has(error.code)) printHelpDone();
      else printUsageFailure(error.message);
      return;
    }
    printUsageFailure(error instanceof Error ? error.message : String(error));
  }
}

void main();
