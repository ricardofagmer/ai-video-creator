import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { formatBytes, formatInstant, formatUsd, runStatusLabel } from '../output/format.js';
import { formatSlotLong, formatSlotShort } from '../schedules/slot-time.js';
import { CLI_LOCALES } from './locale.js';
import { cliLocale, cliMessages, cliText, setCliLocale } from './messages.js';

/*
 * The three catalogues have the same key paths (typecheck enforces it; this catches a value of the
 * wrong kind), the active language switches the texts and the formats, and pt-BR stays the default
 * with its historical formats.
 */

function shapeOf(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function') return [`${prefix}()`];
  if (typeof value === 'string') return [prefix];
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shapeOf(Reflect.get(value, key), prefix === '' ? key : `${prefix}.${key}`));
  }
  return [`${prefix}:${typeof value}`];
}

afterEach(() => setCliLocale('pt-BR'));

describe('CLI catalogues', () => {
  it('have the same key paths and value kinds in every locale', () => {
    const reference = shapeOf(cliMessages['pt-BR']);
    for (const locale of CLI_LOCALES) assert.deepEqual(shapeOf(cliMessages[locale]), reference, locale);
  });

  it('default to pt-BR', () => {
    assert.equal(cliLocale(), 'pt-BR');
    assert.equal(cliText().runs.list.empty, 'Nenhuma execução ainda. Comece com "studio run".');
  });

  it('switch the texts with the active locale', () => {
    setCliLocale('en');
    assert.equal(runStatusLabel('waiting'), 'waiting for you');
    assert.equal(cliText().doctor.resultOk, 'Result: all good.');
    setCliLocale('es');
    assert.equal(runStatusLabel('waiting'), 'esperándote');
    assert.equal(cliText().platforms.prompt.confirmationPhrase('youtube'), 'publicar youtube');
    setCliLocale('en');
    assert.equal(cliText().platforms.prompt.confirmationPhrase('youtube'), 'publish youtube');
    assert.equal(cliText().hyperframes.traceConfirmationWord, 'verify');
  });
});

describe('formats per locale', () => {
  it('keep the pt-BR formats unchanged', () => {
    assert.equal(formatUsd(1.25), 'US$ 1.25');
    assert.equal(formatBytes(13_002_342), '12.4 MB');
    assert.match(formatInstant('2026-11-20T10:02:00'), /^20\/11\/2026 10:02$/);
    assert.equal(formatSlotLong('2026-11-25T12:00:00Z', 'America/Sao_Paulo'), 'qua., 25/11 09:00');
    assert.equal(formatSlotShort('2026-11-25T12:00:00Z', 'America/Sao_Paulo'), 'qua. 09:00');
  });

  it('use en formats', () => {
    setCliLocale('en');
    assert.equal(formatUsd(1.25), '$1.25');
    assert.equal(formatBytes(13_002_342), '12.4 MB');
    assert.match(formatInstant('2026-11-20T10:02:00'), /^11\/20\/2026 10:02$/);
    assert.equal(formatSlotLong('2026-11-25T12:00:00Z', 'America/Sao_Paulo'), 'Wed, 11/25 09:00');
  });

  it('use es formats', () => {
    setCliLocale('es');
    assert.equal(formatUsd(1.25).replaceAll('\u00a0', ' '), '1,25 US$');
    assert.equal(formatBytes(13_002_342), '12,4 MB');
    assert.match(formatInstant('2026-11-20T10:02:00'), /^20\/11\/2026 10:02$/);
    assert.equal(formatSlotLong('2026-11-25T12:00:00Z', 'America/Sao_Paulo'), 'mié, 25/11 09:00');
  });
});
