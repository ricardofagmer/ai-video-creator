import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALLOWED_FILE_MIME_TYPES_BY_KIND } from './catalog.limits';
import { UNSIGNED_MIME_TYPES, contentMatchesMimeType, folderEntryMimeType, hasContentSignature } from './content-signature';

/* Baseline review: the declared upload MIME type is checked against the leading bytes. */

function bytes(...parts: (string | number[])[]): Buffer {
  return Buffer.concat(parts.map((part) => (typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part))));
}

const SAMPLES: Readonly<Record<string, Buffer>> = {
  'video/mp4': bytes([0, 0, 0, 0x20], 'ftypisom', [0, 0, 2, 0]),
  'video/quicktime': bytes([0, 0, 0, 0x14], 'ftypqt  '),
  'video/webm': bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f]),
  'audio/mp4': bytes([0, 0, 0, 0x20], 'ftypM4A '),
  'audio/mpeg': bytes('ID3', [4, 0, 0]),
  'audio/aac': bytes([0xff, 0xf1, 0x50, 0x80]),
  'audio/flac': bytes('fLaC', [0, 0, 0, 0x22]),
  'audio/wav': bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '),
  'audio/x-wav': bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '),
  'image/png': bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': bytes([0xff, 0xd8, 0xff, 0xe0]),
  'image/webp': bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '),
  'application/pdf': bytes('%PDF-1.7\n'),
  'application/json': bytes('{"a":1}'),
  'text/plain': bytes('plain text'),
  'text/markdown': bytes('# Title'),
};

describe('content signatures', () => {
  it('cover every allowlisted file MIME type except the deliberately unsigned ones', () => {
    const allowlisted = new Set(Object.values(ALLOWED_FILE_MIME_TYPES_BY_KIND).flat());
    for (const mimeType of allowlisted) {
      if (UNSIGNED_MIME_TYPES.includes(mimeType)) continue;
      assert.ok(hasContentSignature(mimeType), `no signature for allowlisted ${mimeType}`);
      assert.ok(SAMPLES[mimeType] !== undefined, `no test sample for ${mimeType}`);
    }
  });

  it('accept each sample for its own type', () => {
    for (const [mimeType, sample] of Object.entries(SAMPLES)) assert.ok(contentMatchesMimeType(mimeType, sample), mimeType);
  });

  it('refuse a binary type whose bytes belong to another format', () => {
    const png = SAMPLES['image/png'] ?? Buffer.alloc(0);
    for (const mimeType of ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'image/jpeg', 'image/webp', 'application/pdf']) {
      assert.equal(contentMatchesMimeType(mimeType, png), false, mimeType);
    }
    assert.equal(contentMatchesMimeType('image/png', SAMPLES['image/jpeg'] ?? Buffer.alloc(0)), false);
    assert.equal(contentMatchesMimeType('audio/mpeg', Buffer.from('not audio at all')), false);
  });

  it('refuse empty content for a binary type', () => {
    assert.equal(contentMatchesMimeType('image/png', Buffer.alloc(0)), false);
  });

  it('refuse text types holding NUL bytes, but accept UTF-16 with a byte order mark', () => {
    assert.equal(contentMatchesMimeType('text/plain', SAMPLES['video/mp4'] ?? Buffer.alloc(0)), false);
    assert.equal(contentMatchesMimeType('application/json', Buffer.from('{"a":\u00001}')), false);
    assert.ok(contentMatchesMimeType('text/plain', Buffer.from([0xff, 0xfe, 0x41, 0x00])));
  });

  it('accept application/octet-stream as declared', () => {
    assert.ok(contentMatchesMimeType('application/octet-stream', Buffer.from([0, 1, 2, 3])));
  });

  it('map folder entries by extension, case-insensitively, and leave unknown extensions unchecked', () => {
    assert.equal(folderEntryMimeType('assets/Logo.PNG'), 'image/png');
    assert.equal(folderEntryMimeType('index.html'), 'text/plain');
    assert.equal(folderEntryMimeType('fonts/inter.woff2'), null);
    assert.equal(folderEntryMimeType('.hidden'), null);
    assert.equal(folderEntryMimeType('LICENSE'), null);
  });
});
