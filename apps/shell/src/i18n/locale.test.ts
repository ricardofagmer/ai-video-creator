import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveShellLocale, shellLocaleOf } from './locale';

describe('shell menu language', () => {
  it('maps BCP 47 and POSIX tags to the three menu languages', () => {
    assert.equal(shellLocaleOf('pt-BR'), 'pt-BR');
    assert.equal(shellLocaleOf('pt-PT'), 'pt-BR');
    assert.equal(shellLocaleOf('es_MX.UTF-8'), 'es');
    assert.equal(shellLocaleOf('en-US'), 'en');
    assert.equal(shellLocaleOf('fr-FR'), null);
  });

  it('takes the first supported preferred language, else pt-BR', () => {
    assert.equal(resolveShellLocale(['fr-FR', 'en-GB', 'pt-BR']), 'en');
    assert.equal(resolveShellLocale(['de-DE']), 'pt-BR');
    assert.equal(resolveShellLocale([]), 'pt-BR');
  });
});
