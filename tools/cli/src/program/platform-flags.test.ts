import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ExitCode } from '../errors/exit-codes.js';
import { RUN_ID, createTempStudio, type TempStudio } from '../platforms/platform-cli.harness.test.js';
import { runProgram } from './program.js';

/*
 * SPEC 0007 section 5.9 and K4 through the real commander program: `studio runs publish` has no
 * flag that supplies the typed confirmation, and `studio secrets set` takes the name only, so a
 * value can never be passed in argv. Only help and commander's own refusals run here: they stop
 * before any action, so no core context, terminal prompt or Keychain call is reached.
 */

/** The long flags listed under "Options:" in a commander help text. */
function longFlagsOf(help: string): string[] {
  const options = help.split(/\n(?:Options|Opções):\n/)[1] ?? '';
  const section = options.split(/\n\S/)[0] ?? '';
  return [...section.matchAll(/^\s+(?:-\w, )?(--[a-z-]+)/gm)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])).sort();
}

describe('platform command flags (SPEC 0007 section 5.9)', () => {
  let studio: TempStudio;

  beforeEach(async () => {
    studio = await createTempStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  it('offers only --platform on studio runs publish', async () => {
    assert.equal(await runProgram(['runs', 'publish', '--help'], studio.dependencies), ExitCode.ok);

    assert.deepEqual(longFlagsOf(studio.printer.lines.join('\n')), ['--help', '--platform']);
  });

  for (const flag of ['--yes', '--confirm', '--confirm=publicar youtube', '--force', '-y']) {
    it(`refuses ${flag} as a usage error before the command runs`, async () => {
      const exitCode = await runProgram(['runs', 'publish', RUN_ID, '--platform', 'youtube', flag], studio.dependencies);

      assert.equal(exitCode, ExitCode.usage);
      assert.equal(studio.printer.lines.some((line) => line.includes('Publicar a execução')), false);
    });
  }

  it('takes only the name on studio secrets set, with no option that carries a value', async () => {
    assert.equal(await runProgram(['secrets', 'set', '--help'], studio.dependencies), ExitCode.ok);

    const help = studio.printer.lines.join('\n');
    assert.match(help, /secrets set \[options\] <nome>/);
    assert.deepEqual(longFlagsOf(help), ['--help']);
  });
});
