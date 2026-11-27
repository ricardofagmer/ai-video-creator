import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSrt } from '../media/srt';

/* CR12 (ticket 10): the SRT reader the caption burn and media review use. */

describe('toolbox parseSrt (CR12)', () => {
  it('reads one cue per block with start, end and joined text', () => {
    const srt = ['1', '00:00:01,000 --> 00:00:02,500', 'Olá', 'mundo', '', '2', '00:00:03,250 --> 00:00:04,000', 'Fim'].join('\n');

    assert.deepEqual(parseSrt(srt), [
      { startS: 1, endS: 2.5, text: 'Olá mundo' },
      { startS: 3.25, endS: 4, text: 'Fim' },
    ]);
  });

  it('accepts CRLF line endings, a dot before the milliseconds and hours', () => {
    const srt = '1\r\n01:02:03.4 --> 01:02:04.45\r\nTexto\r\n';

    assert.deepEqual(parseSrt(srt), [{ startS: 3723.4, endS: 3724.45, text: 'Texto' }]);
  });

  it('drops markup tags from the text', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i>itálico</i> e <b>negrito</b>\n';

    assert.deepEqual(parseSrt(srt), [{ startS: 0, endS: 1, text: 'itálico e negrito' }]);
  });

  it('skips empty, inverted, zero-length and untimed blocks', () => {
    const srt = [
      '1\n00:00:01,000 --> 00:00:02,000\n<i></i>',
      '2\n00:00:05,000 --> 00:00:04,000\ninvertido',
      '3\n00:00:06,000 --> 00:00:06,000\nzero',
      'sem tempo\nnenhum',
      '4\n00:00:07,000 --> 00:00:08,000\nválido',
    ].join('\n\n');

    assert.deepEqual(parseSrt(srt), [{ startS: 7, endS: 8, text: 'válido' }]);
  });

  it('returns no cues for empty input', () => {
    assert.deepEqual(parseSrt(''), []);
    assert.deepEqual(parseSrt('\n\n  \n'), []);
  });
});
