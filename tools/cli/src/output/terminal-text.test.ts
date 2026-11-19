import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripTerminalControls } from './terminal-text.js';

/* Security review SEC-2: owner text reaches the terminal without control sequences. */
describe('stripTerminalControls', () => {
  it('removes an ESC/CSI sequence stored in a schedule title, leaving its printable text', () => {
    assert.equal(stripTerminalControls('Semanal \u001b[2J\u001b]0;pwned\u0007fim'), 'Semanal [2J]0;pwnedfim');
  });

  it('removes DEL and C1 controls, including the single-byte CSI', () => {
    assert.equal(stripTerminalControls('a\u007fb\u0085c\u009bd'), 'abcd');
  });

  it('keeps tab, newline and non-ASCII text such as pt-BR accents', () => {
    assert.equal(stripTerminalControls('Próximos horários:\n\tsábado'), 'Próximos horários:\n\tsábado');
  });
});
