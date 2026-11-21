import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SafeText } from './safe-text.js';

/* Baseline review 2026-11-21: dashboard notices and paths reach Ink without control sequences. */
describe('SafeText', () => {
  function renderedChildren(text: string): unknown {
    const props: unknown = SafeText({ children: text, color: 'red' }).props;
    assert.ok(typeof props === 'object' && props !== null && 'children' in props && 'color' in props);
    assert.equal(props.color, 'red');
    return props.children;
  }

  it('hands Ink the notice text without ESC, CSI, BEL or carriage return', () => {
    assert.equal(renderedChildren('Falha\u001b[2J\u001b]0;pwned\u0007\r ao pausar'), 'Falha[2J]0;pwned ao pausar');
  });

  it('keeps ordinary pt-BR text as written', () => {
    assert.equal(renderedChildren('Enviando pedido... ação concluída'), 'Enviando pedido... ação concluída');
  });
});
