import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRACE_ATTRIBUTE_ALLOWLIST, allowedAttributes } from './allowlist';

/*
 * SPEC 0006 R3-09, R3-AC-26, ADR 0006 "Privacy rules": the allowlist is the only source of exported
 * attributes. A key that is not on it, a key of the other scope, or a value its rule refuses is
 * dropped and counted; null and undefined are "no value" and are not counted.
 */

const RUN_ID = '01JDA60000000000000000RNN1';

describe('telemetry attribute allowlist', () => {
  it('keeps only allowlisted span attributes whose values pass their rule', () => {
    const result = allowedAttributes(
      {
        'studio.run.id': RUN_ID,
        'studio.step.key': 'script:execute:2',
        'studio.model.id': 'claude-sonnet-5-5',
        'studio.cost.usd': 0.42,
        'studio.tokens.input': 1200,
        'studio.prompt.refs': ['script-writer@3', 'reviewer@1'],
        'studio.correlation.id': null,
        'studio.reason.id': undefined,
        // Refused: not on the allowlist at all.
        text: 'Roteiro secreto do briefing',
        'host.name': 'owner-macbook',
        'process.command_line': 'node /Users/owner/watcher.js',
        // Refused: allowlisted for the resource only.
        'service.name': 'engineos-video-creator-watcher',
        // Refused: the value fails the key's rule.
        'studio.session.id': 'not-a-ulid',
        'studio.outcome': 'Falhou ao abrir /Users/owner/ricardo-clone/voice.wav',
        'studio.tokens.output': -1,
        'studio.step.attempt': 1.5,
        'studio.skill.refs': ['/Users/owner/skills/writer.md'],
        'studio.check.passed': 'body-changed',
      },
      'span',
    );

    assert.deepEqual(
      result.attributes.map((attribute) => attribute.key),
      ['studio.run.id', 'studio.step.key', 'studio.model.id', 'studio.cost.usd', 'studio.tokens.input', 'studio.prompt.refs'],
    );
    assert.deepEqual(result.attributes[0]?.value, { stringValue: RUN_ID });
    assert.deepEqual(result.attributes[3]?.value, { doubleValue: 0.42 });
    assert.deepEqual(result.attributes[4]?.value, { intValue: '1200' });
    assert.deepEqual(result.attributes[5]?.value, {
      arrayValue: { values: [{ stringValue: 'script-writer@3' }, { stringValue: 'reviewer@1' }] },
    });
    assert.equal(result.dropped, 10);
  });

  it('admits service.name and service.version only on the resource', () => {
    const result = allowedAttributes(
      {
        'service.name': 'engineos-video-creator-watcher',
        'service.version': '0.1.0',
        'studio.run.id': RUN_ID,
        'host.name': 'owner-macbook',
        'os.description': 'macOS',
      },
      'resource',
    );
    assert.deepEqual(
      result.attributes.map((attribute) => attribute.key),
      ['service.name', 'service.version'],
    );
    assert.equal(result.dropped, 3);
  });

  it('refuses a service name outside the studio services', () => {
    const result = allowedAttributes({ 'service.name': 'owner-laptop-agent' }, 'resource');
    assert.deepEqual(result.attributes, []);
    assert.equal(result.dropped, 1);
  });

  it('lists no key that names text, a path, a URL, a host or a process', () => {
    const forbidden = /text|brief|path|url|host|user|command|title|message|error/;
    for (const key of TRACE_ATTRIBUTE_ALLOWLIST.keys()) assert.doesNotMatch(key, forbidden, key);
  });
});
