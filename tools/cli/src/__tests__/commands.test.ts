import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DataHome } from '@studio/core/paths';
import { type CommandDependencies } from '../commands/command-dependencies.js';
import { toErrorReport } from '../errors/error-report.js';
import { ExitCode } from '../errors/exit-codes.js';
import { type Printer } from '../output/printer.js';
import { runProgram } from '../program/program.js';
import { type CliSettings } from '../settings/cli-settings.js';

/*
 * CR12 (ticket 10, AC 1): every `studio` command through the real commander program, in-process.
 * Only help, commander's own refusals, boundary validation and `models verify` (read-only, no
 * database) run here, so no core context, database, terminal prompt, Keychain or network is
 * reached. The temp home follows SPEC 2026-11-21 section 8.1: a realpath'd mkdtemp folder under
 * the OS temp folder, every path inside it, a fixed fake credential, and rm -rf on close.
 */

const SENTINEL_KEY = 'sk-ant-sentinel-cli-coverage-7f3a9c41';
const VALID_ULID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const UNKNOWN_FLAG = '--bogus-flag';

class CapturingPrinter implements Printer {
  readonly lines: string[] = [];
  readonly errors: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.errors.push(text);
  }
}

interface CliHome {
  root: string;
  settings: CliSettings;
  close(): Promise<void>;
}

async function createCliHome(prefix: string): Promise<CliHome> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  const settings: CliSettings = {
    dataHome: new DataHome(join(root, 'data')),
    ports: { web: 4310, api: 4311 },
    studioRoot: join(root, 'studio'),
    childEnvironment: {},
    keyVariablesSet: [],
    homeDirectory: join(root, 'home'),
  };
  return { root, settings, close: () => rm(root, { recursive: true, force: true }) };
}

interface CliOutcome {
  exitCode: number;
  out: string;
  err: string;
}

/** Runs one argv the way `main` does: a thrown error becomes one stderr line and its exit code. */
async function runCli(home: CliHome, argv: readonly string[]): Promise<CliOutcome> {
  const printer = new CapturingPrinter();
  const dependencies: CommandDependencies = { settings: home.settings, printer, signal: new AbortController().signal };
  let exitCode: number;
  try {
    exitCode = await runProgram(argv, dependencies);
  } catch (error) {
    const report = toErrorReport(error);
    printer.error(report.message);
    exitCode = report.exitCode;
  }
  return { exitCode, out: printer.lines.join('\n'), err: printer.errors.join('\n') };
}

/** The lines of one commander help section ("Options:" or "Commands:"). */
function helpSection(help: string, heading: 'Options' | 'Commands'): string[] {
  const lines = help.split('\n');
  const start = lines.indexOf(`${heading}:`);
  if (start < 0) return [];
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line !== '' && !line.startsWith(' ')) break;
    section.push(line);
  }
  return section;
}

/** Terms start at a two-space indent; wrapped description lines are indented further. */
function termsOf(section: readonly string[], pattern: RegExp): string[] {
  return section.flatMap((line) => {
    const name = pattern.exec(line)?.[1];
    return name === undefined ? [] : [name];
  });
}

function longFlagsOf(help: string): string[] {
  return termsOf(helpSection(help, 'Options'), /^ {2}(?:-\w, )?(--[a-z][a-z-]*)/).sort();
}

function subcommandsOf(help: string): string[] {
  return termsOf(helpSection(help, 'Commands'), /^ {2}([a-z][a-z-]*)/)
    .filter((name) => name !== 'help')
    .sort();
}

interface RequiredOption {
  flag: string;
  value: string;
}

interface LeafCommand {
  path: readonly string[];
  /** Long flags the help documents, `--help` included. */
  flags: readonly string[];
  /**
   * Required positional values. They are deliberately invalid, so the command's boundary parser
   * would refuse them even if commander ever let the action start.
   */
  positionals: readonly string[];
  requiredOptions: readonly RequiredOption[];
}

function leaf(path: string, options: { flags?: readonly string[]; positionals?: readonly string[]; requiredOptions?: readonly RequiredOption[] } = {}): LeafCommand {
  return {
    path: path.split(' '),
    flags: [...(options.flags ?? []), '--help'].sort(),
    positionals: options.positionals ?? [],
    requiredOptions: options.requiredOptions ?? [],
  };
}

function optionArguments(options: readonly RequiredOption[]): string[] {
  return options.flatMap((option) => [option.flag, option.value]);
}

const leafCommands: readonly LeafCommand[] = [
  leaf('status'),
  leaf('run', {
    flags: ['--brief', '--recipe', '--reference', '--title'],
    requiredOptions: [
      { flag: '--recipe', value: 'receita@1' },
      { flag: '--brief', value: 'briefing.json' },
    ],
  }),
  leaf('pause', { positionals: ['not-a-run-id'] }),
  leaf('resume', { positionals: ['not-a-run-id'] }),
  leaf('approve', { flags: ['--notes'], positionals: ['not-a-run-id'] }),
  leaf('reject', { flags: ['--notes'], positionals: ['not-a-run-id'], requiredOptions: [{ flag: '--notes', value: 'motivo' }] }),
  leaf('start'),
  leaf('stop'),
  leaf('doctor', { flags: ['--rebuild-index'] }),
  leaf('catalog import', {
    flags: ['--by-reference', '--id', '--kind', '--metadata', '--mime', '--sensitivity'],
    positionals: ['arquivo.png'],
    requiredOptions: [
      { flag: '--kind', value: 'image' },
      { flag: '--id', value: 'logo' },
      { flag: '--metadata', value: 'metadata.json' },
    ],
  }),
  leaf('catalog seed', { flags: ['--source-root'] }),
  leaf('catalog rescore'),
  leaf('catalog embed', { flags: ['--all', '--stale'] }),
  leaf('catalog search', { flags: ['--limit', '--semantic'], requiredOptions: [{ flag: '--semantic', value: 'abertura' }] }),
  leaf('secrets set', { positionals: ['not-a-secret-name'] }),
  leaf('passphrase set'),
  leaf('passphrase status'),
  leaf('models status'),
  leaf('models verify'),
  leaf('models fetch'),
  leaf('schedules list'),
  leaf('schedules show', { positionals: ['not-a-schedule-id'] }),
  leaf('schedules pause', { positionals: ['not-a-schedule-id'] }),
  leaf('schedules resume', { positionals: ['not-a-schedule-id'] }),
  leaf('schedules delete', { positionals: ['not-a-schedule-id'] }),
  leaf('metrics sync'),
  leaf('metrics import', {
    flags: ['--as-of', '--dry-run', '--platform'],
    positionals: ['metricas.csv'],
    requiredOptions: [
      { flag: '--platform', value: 'not-a-platform' },
      { flag: '--as-of', value: 'not-a-date' },
    ],
  }),
  leaf('insights', { flags: ['--json'] }),
  leaf('platforms list'),
  leaf('platforms enable', { flags: ['--capability'], positionals: ['not-a-platform'], requiredOptions: [{ flag: '--capability', value: 'metrics' }] }),
  leaf('platforms disable', { flags: ['--capability'], positionals: ['not-a-platform'], requiredOptions: [{ flag: '--capability', value: 'metrics' }] }),
  leaf('platforms disconnect', { positionals: ['not-a-platform'] }),
  leaf('platforms connect', { positionals: ['not-a-platform'] }),
  leaf('runs show', { positionals: ['not-a-run-id'] }),
  leaf('runs publish', { flags: ['--platform'], positionals: ['not-a-run-id'], requiredOptions: [{ flag: '--platform', value: 'youtube' }] }),
  leaf('traces export', { flags: ['--force', '--out'], positionals: ['not-a-trace-id'], requiredOptions: [{ flag: '--out', value: 'rastro.json' }] }),
  leaf('hyperframes status'),
  leaf('hyperframes chrome install'),
  leaf('hyperframes trace'),
  leaf('hyperframes enable'),
  leaf('hyperframes disable'),
];

/** Documented subcommands per group; the empty path is the top level. */
const commandGroups: Readonly<Record<string, readonly string[]>> = {
  '': [
    'approve',
    'catalog',
    'doctor',
    'hyperframes',
    'insights',
    'metrics',
    'models',
    'passphrase',
    'pause',
    'platforms',
    'reject',
    'resume',
    'run',
    'runs',
    'schedules',
    'secrets',
    'start',
    'status',
    'stop',
    'traces',
  ],
  catalog: ['embed', 'import', 'rescore', 'search', 'seed'],
  secrets: ['set'],
  passphrase: ['set', 'status'],
  models: ['fetch', 'status', 'verify'],
  schedules: ['delete', 'list', 'pause', 'resume', 'show'],
  metrics: ['import', 'sync'],
  platforms: ['connect', 'disable', 'disconnect', 'enable', 'list'],
  runs: ['publish', 'show'],
  traces: ['export'],
  hyperframes: ['chrome', 'disable', 'enable', 'status', 'trace'],
  'hyperframes chrome': ['install'],
};

function pathArguments(path: string): string[] {
  return path === '' ? [] : path.split(' ');
}

describe('studio CLI commands (CR12, ticket 10 AC 1)', () => {
  let home: CliHome;

  beforeEach(async () => {
    home = await createCliHome('studio-cli-coverage-');
  });

  afterEach(async () => {
    await home.close();
  });

  describe('help', () => {
    for (const [group, expected] of Object.entries(commandGroups)) {
      const label = group === '' ? 'studio --help' : `studio ${group} --help`;
      it(`${label} exits 0 and lists exactly the documented commands`, async () => {
        const outcome = await runCli(home, [...pathArguments(group), '--help']);

        assert.equal(outcome.exitCode, ExitCode.ok);
        assert.deepEqual(subcommandsOf(outcome.out), [...expected].sort());
      });
    }

    it('the command table covers every leaf command the help tree shows', async () => {
      const found: string[] = [];
      const pending: string[][] = [[]];
      for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
        const children = subcommandsOf((await runCli(home, [...path, '--help'])).out);
        if (children.length === 0) found.push(path.join(' '));
        for (const child of children) pending.push([...path, child]);
      }

      assert.deepEqual(found.sort(), leafCommands.map((command) => command.path.join(' ')).sort());
    });
  });

  describe('flags of every command', () => {
    for (const command of leafCommands) {
      const name = `studio ${command.path.join(' ')}`;

      it(`${name} --help exits 0 and lists exactly its documented flags`, async () => {
        const outcome = await runCli(home, [...command.path, '--help']);

        assert.equal(outcome.exitCode, ExitCode.ok);
        assert.deepEqual(longFlagsOf(outcome.out), command.flags);
      });

      it(`${name} refuses an unknown flag with exit 2 before the command runs`, async () => {
        const argv = [...command.path, ...command.positionals, ...optionArguments(command.requiredOptions), UNKNOWN_FLAG];

        const outcome = await runCli(home, argv);

        assert.equal(outcome.exitCode, ExitCode.usage);
        assert.match(outcome.err, new RegExp(`unknown option '${UNKNOWN_FLAG}'`));
        assert.equal(outcome.out, '');
      });

      for (const omitted of command.requiredOptions) {
        it(`${name} without ${omitted.flag} exits 2 naming the missing option`, async () => {
          const others = command.requiredOptions.filter((option) => option !== omitted);

          const outcome = await runCli(home, [...command.path, ...command.positionals, ...optionArguments(others)]);

          assert.equal(outcome.exitCode, ExitCode.usage);
          assert.match(outcome.err, new RegExp(`required option '${omitted.flag}`));
        });
      }

      if (command.positionals.length > 0) {
        it(`${name} without its argument exits 2 naming the missing argument`, async () => {
          const outcome = await runCli(home, [...command.path, ...optionArguments(command.requiredOptions)]);

          assert.equal(outcome.exitCode, ExitCode.usage);
          assert.match(outcome.err, /missing required argument/);
        });
      }
    }

    it('studio refuses an unknown top-level flag with exit 2 and never opens the dashboard', async () => {
      const outcome = await runCli(home, [UNKNOWN_FLAG]);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.match(outcome.err, new RegExp(`unknown option '${UNKNOWN_FLAG}'`));
    });

    it('studio refuses an unknown command with exit 2 and never opens the dashboard', async () => {
      const outcome = await runCli(home, ['frobnicate']);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.equal(outcome.out, '');
    });

    it('a command group called without a subcommand exits 2 and prints its help on stderr', async () => {
      const outcome = await runCli(home, ['catalog']);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.match(outcome.err, /Commands:/);
    });

    it('a command group refuses an unknown flag with exit 2', async () => {
      const outcome = await runCli(home, ['catalog', UNKNOWN_FLAG]);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.match(outcome.err, new RegExp(`unknown option '${UNKNOWN_FLAG}'`));
    });
  });

  describe('boundary validation exits 2 before any core work', () => {
    const refusals: readonly { argv: readonly string[]; names?: RegExp }[] = [
      { argv: ['status', 'not-a-run-id'] },
      { argv: ['pause', 'not-a-run-id'] },
      { argv: ['approve', 'not-a-run-id'] },
      { argv: ['reject', VALID_ULID, '--notes', '   '], names: /--notes/ },
      { argv: ['start', 'database'] },
      { argv: ['stop', 'database'] },
      { argv: ['catalog', 'embed', '--stale', '--all'], names: /--stale ou --all/ },
      { argv: ['catalog', 'search', '--semantic', 'abertura', '--limit', '21'], names: /--limit/ },
      { argv: ['catalog', 'search', '--semantic', 'abertura', '--limit', '0'], names: /--limit/ },
      { argv: ['catalog', 'search', '--semantic', 'a'.repeat(501)], names: /--semantic/ },
      { argv: ['catalog', 'search', '--semantic', '   '], names: /--semantic/ },
      {
        argv: ['run', '--recipe', 'receita@1', '--brief', 'briefing.json', ...Array.from({ length: 51 }, (_, index) => ['--reference', `ativo-${index}@1`]).flat()],
        names: /--reference/,
      },
      { argv: ['metrics', 'import', 'metricas.csv', '--platform', 'not-a-platform', '--as-of', '2026-11-01'], names: /--platform/ },
      { argv: ['metrics', 'import', 'metricas.csv', '--platform', 'youtube', '--as-of', 'not-a-date'], names: /--as-of/ },
      { argv: ['traces', 'export', 'not-a-trace-id', '--out', 'rastro.json'] },
      { argv: ['traces', 'export', VALID_ULID, '--out', ''], names: /--out/ },
      { argv: ['platforms', 'enable', 'youtube', '--capability', 'everything'], names: /--capability/ },
      { argv: ['platforms', 'disconnect', 'not-a-platform'] },
      { argv: ['schedules', 'show', 'not-a-schedule-id'] },
      { argv: ['runs', 'show', 'not-a-run-id'] },
      { argv: ['runs', 'publish', 'not-a-run-id', '--platform', 'youtube'] },
      { argv: ['runs', 'publish', VALID_ULID, '--platform', 'not-a-platform'], names: /--platform/ },
      { argv: ['secrets', 'set', 'not-a-secret-name'] },
    ];

    for (const refusal of refusals) {
      const shown = refusal.argv.map((part) => (part.length > 40 ? `${part.slice(0, 12)}...` : part)).join(' ');
      it(`studio ${shown.slice(0, 120)} exits 2`, async () => {
        const outcome = await runCli(home, refusal.argv);

        assert.equal(outcome.exitCode, ExitCode.usage);
        assert.notEqual(outcome.err, '');
        if (refusal.names !== undefined) assert.match(outcome.err, refusal.names);
      });
    }

    it('never echoes a refused option value', async () => {
      const outcome = await runCli(home, ['catalog', 'search', '--semantic', SENTINEL_KEY, '--limit', '99']);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.equal(`${outcome.out}\n${outcome.err}`.includes(SENTINEL_KEY), false);
    });

    it('never echoes a value typed where a secret name goes', async () => {
      const outcome = await runCli(home, ['secrets', 'set', SENTINEL_KEY]);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.equal(`${outcome.out}\n${outcome.err}`.includes(SENTINEL_KEY), false);
    });
  });

  describe('documented exit codes', () => {
    it('studio platforms connect explains the web page on stderr and exits 2', async () => {
      const outcome = await runCli(home, ['platforms', 'connect', 'youtube']);

      assert.equal(outcome.exitCode, ExitCode.usage);
      assert.match(outcome.err, /4310/);
      assert.equal(outcome.out, '');
    });

    describe('studio models verify', () => {
      const modelRef = 'coverage-model@r1';
      const modelFileName = 'model.onnx';
      const modelBytes = Buffer.from('coverage embedding model weights v1');

      function sha256Hex(bytes: Buffer): string {
        return createHash('sha256').update(bytes).digest('hex');
      }

      function manifestOf(file: { sha256: string; sizeBytes: number }): Record<string, unknown> {
        return { modelRef, dimensions: 4, queryPrefix: '', passagePrefix: '', maxInputTokens: 16, files: [{ path: modelFileName, ...file }] };
      }

      async function writeManifest(manifest: Record<string, unknown>): Promise<void> {
        const folder = join(home.settings.studioRoot, 'scripts', 'models');
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, 'embedding-model.manifest.json'), JSON.stringify(manifest));
      }

      async function writeModelFile(bytes: Buffer): Promise<void> {
        const folder = home.settings.dataHome.embeddingModelDirectory(modelRef);
        assert.ok(folder.startsWith(`${home.root}/`), 'the model folder stays inside the temp home');
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, modelFileName), bytes);
      }

      it('exits 5 when the manifest is missing', async () => {
        const outcome = await runCli(home, ['models', 'verify']);

        assert.equal(outcome.exitCode, ExitCode.dependency);
        assert.match(outcome.out, /inválido/);
      });

      it('exits 5 when the manifest still holds provisional pins', async () => {
        await writeManifest(manifestOf({ sha256: '0'.repeat(64), sizeBytes: 0 }));

        const outcome = await runCli(home, ['models', 'verify']);

        assert.equal(outcome.exitCode, ExitCode.dependency);
        assert.match(outcome.out, /provisório/);
      });

      it('exits 5 when the pinned model is absent from the data home', async () => {
        await writeManifest(manifestOf({ sha256: sha256Hex(modelBytes), sizeBytes: modelBytes.length }));

        const outcome = await runCli(home, ['models', 'verify']);

        assert.equal(outcome.exitCode, ExitCode.dependency);
        assert.match(outcome.out, /ausente/);
      });

      it('exits 6 when a model file differs from its pinned sha-256', async () => {
        await writeManifest(manifestOf({ sha256: sha256Hex(modelBytes), sizeBytes: modelBytes.length }));
        await writeModelFile(Buffer.alloc(modelBytes.length, 0x41));

        const outcome = await runCli(home, ['models', 'verify']);

        assert.equal(outcome.exitCode, ExitCode.unhealthy);
        assert.match(outcome.out, /sha-256 não confere/);
        assert.equal(outcome.out.includes(home.root), false, 'no path is printed');
      });

      it('exits 0 when every pinned file matches', async () => {
        await writeManifest(manifestOf({ sha256: sha256Hex(modelBytes), sizeBytes: modelBytes.length }));
        await writeModelFile(modelBytes);

        const outcome = await runCli(home, ['models', 'verify']);

        assert.equal(outcome.exitCode, ExitCode.ok);
        assert.match(outcome.out, /confere com o manifesto/);
      });
    });
  });
});
