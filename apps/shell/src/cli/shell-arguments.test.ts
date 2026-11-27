import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseShellArguments } from './shell-arguments';

describe('shell arguments', () => {
  it('recognises --unregister-login-item', () => {
    assert.deepEqual(parseShellArguments(['/Applications/EngineOS Video Creator.app/Contents/MacOS/EngineOS Video Creator', '--unregister-login-item']), {
      kind: 'unregister-login-item',
    });
  });

  it('ignores every other argument', () => {
    for (const argv of [[], ['/app'], ['/app', '-psn_0_12345'], ['/app', '--unregister-login-item=false'], ['/app', '--inspect', 'start']]) {
      assert.deepEqual(parseShellArguments(argv), { kind: 'tray' });
    }
  });
});
