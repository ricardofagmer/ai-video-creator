import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, ExternalToolError, InputError, ManifestChangedError, ProviderError, isErrnoException } from '../errors';

/*
 * CR12 (ticket 10): the toolbox error taxonomy. cli/execute.ts maps InputError and its subclasses
 * to exit 1 with run.json untouched, so subclassing is the contract, and every error names itself.
 */

describe('toolbox errors (CR12)', () => {
  it('keeps the message and the optional next step on an InputError', () => {
    const error = new InputError('bad input', 'fix it and re-run');

    assert.equal(error.name, 'InputError');
    assert.equal(error.message, 'bad input');
    assert.equal(error.next, 'fix it and re-run');
    assert.equal(new InputError('no next').next, undefined);
  });

  it('makes ConfigError an InputError that points at .env.example', () => {
    const error = new ConfigError('ELEVENLABS_API_KEY is missing');

    assert.ok(error instanceof InputError);
    assert.equal(error.name, 'ConfigError');
    assert.match(error.next ?? '', /\.env\.example/);
  });

  it('makes ManifestChangedError an InputError with its own next step', () => {
    const error = new ManifestChangedError('script.json changed', 'run ace validate again');

    assert.ok(error instanceof InputError);
    assert.equal(error.name, 'ManifestChangedError');
    assert.equal(error.next, 'run ace validate again');
  });

  it('keeps provider and tool errors outside the InputError family', () => {
    const provider = new ProviderError('timeout', 'elevenlabs', 504);
    const tool = new ExternalToolError('missing', 'ffmpeg');

    assert.equal(provider instanceof InputError, false);
    assert.equal(tool instanceof InputError, false);
    assert.deepEqual([provider.name, provider.provider, provider.status], ['ProviderError', 'elevenlabs', 504]);
    assert.deepEqual([tool.name, tool.tool], ['ExternalToolError', 'ffmpeg']);
    assert.equal(new ProviderError('down', 'playwright').status, undefined);
  });

  it('recognizes errors that carry a code as errno exceptions', () => {
    const errno = Object.assign(new Error('not found'), { code: 'ENOENT' });

    assert.equal(isErrnoException(errno), true);
    assert.equal(isErrnoException(new Error('plain')), false);
    assert.equal(isErrnoException({ code: 'ENOENT' }), false);
    assert.equal(isErrnoException(null), false);
  });
});
