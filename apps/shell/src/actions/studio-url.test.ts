import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { studioUrl } from './studio-url';

/* R3-AC-25.7: the only URL handed to the browser is the loopback web origin for the configured port. */

describe('open-studio URL (R3-AC-25.7)', () => {
  it('returns http://127.0.0.1:<webPort>/ for the configured port', () => {
    assert.equal(studioUrl(4310), 'http://127.0.0.1:4310/');
    assert.equal(studioUrl(5000), 'http://127.0.0.1:5000/');
  });

  it('refuses a port outside 1024..65535 or not an integer', () => {
    for (const port of [0, 80, 1023, 65536, 4310.5, Number.NaN]) assert.throws(() => studioUrl(port), RangeError);
  });
});
