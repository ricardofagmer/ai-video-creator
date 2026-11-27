import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CLI_LOCALE, resolveSystemLocale } from './locale.js';

/*
 * The CLI language comes only from the system locale: LC_ALL, then LC_MESSAGES, then LANG (POSIX
 * precedence), skipping blank values and C/POSIX, with pt-BR as the fallback. The environment is a
 * plain object here; the real one is read only in `main.ts`.
 */

describe('resolveSystemLocale', () => {
  it('maps the language part of LANG to the three supported locales', () => {
    assert.equal(resolveSystemLocale({ LANG: 'pt_BR.UTF-8' }), 'pt-BR');
    assert.equal(resolveSystemLocale({ LANG: 'pt_PT.UTF-8' }), 'pt-BR');
    assert.equal(resolveSystemLocale({ LANG: 'es_ES.UTF-8' }), 'es');
    assert.equal(resolveSystemLocale({ LANG: 'es_MX.UTF-8' }), 'es');
    assert.equal(resolveSystemLocale({ LANG: 'en_US.UTF-8' }), 'en');
    assert.equal(resolveSystemLocale({ LANG: 'en_GB' }), 'en');
    assert.equal(resolveSystemLocale({ LANG: 'en_US.UTF-8@euro' }), 'en');
    assert.equal(resolveSystemLocale({ LANG: 'es' }), 'es');
    assert.equal(resolveSystemLocale({ LANG: 'EN_us' }), 'en');
  });

  it('gives LC_ALL priority over LC_MESSAGES and LANG', () => {
    assert.equal(resolveSystemLocale({ LC_ALL: 'en_US.UTF-8', LANG: 'pt_BR.UTF-8' }), 'en');
    assert.equal(resolveSystemLocale({ LC_ALL: 'es_ES.UTF-8', LC_MESSAGES: 'en_US.UTF-8', LANG: 'pt_BR.UTF-8' }), 'es');
  });

  it('gives LC_MESSAGES priority over LANG', () => {
    assert.equal(resolveSystemLocale({ LC_MESSAGES: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' }), 'es');
  });

  it('skips C, POSIX, C.UTF-8 and blank values', () => {
    assert.equal(resolveSystemLocale({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }), 'en');
    assert.equal(resolveSystemLocale({ LC_ALL: 'POSIX', LC_MESSAGES: 'es_ES.UTF-8' }), 'es');
    assert.equal(resolveSystemLocale({ LC_ALL: '', LC_MESSAGES: '  ', LANG: 'en_US.UTF-8' }), 'en');
    assert.equal(resolveSystemLocale({ LANG: 'C.UTF-8' }), 'pt-BR');
    assert.equal(resolveSystemLocale({ LANG: 'C' }), 'pt-BR');
  });

  it('falls back to pt-BR when nothing is set', () => {
    assert.equal(resolveSystemLocale({}), DEFAULT_CLI_LOCALE);
    assert.equal(DEFAULT_CLI_LOCALE, 'pt-BR');
  });

  it('lets the first set variable decide, so an unsupported language gives pt-BR without reading LANG', () => {
    assert.equal(resolveSystemLocale({ LANG: 'fr_FR.UTF-8' }), 'pt-BR');
    assert.equal(resolveSystemLocale({ LC_ALL: 'fr_FR.UTF-8', LANG: 'en_US.UTF-8' }), 'pt-BR');
  });
});
