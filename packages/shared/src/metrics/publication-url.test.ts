import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePublicationUrl, type ParsedPublicationUrl } from './publication-url';

/*
 * SPEC 0006 section 5.1, R3-AC-01 and R3-AC-02 (pure side): every accepted URL form stores the
 * expected platform, video id and rebuilt canonical URL; every refused form answers its reason.
 */

const youtubeId = 'dQw4w9WgXcQ';
const instagramCode = 'C0dEfGhIjK1';
const tiktokId = '7212345678901234567';

interface AcceptedCase {
  input: string;
  expected: ParsedPublicationUrl;
}

const accepted: readonly AcceptedCase[] = [
  {
    input: `https://www.youtube.com/watch?v=${youtubeId}`,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}` },
  },
  {
    input: `https://youtube.com/watch?v=${youtubeId}&t=42s&si=tracking#comments`,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}` },
  },
  {
    input: `https://m.youtube.com/watch?feature=share&v=${youtubeId}`,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://www.youtube.com/watch?v=${youtubeId}` },
  },
  {
    input: `https://www.youtube.com/shorts/${youtubeId}`,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://www.youtube.com/shorts/${youtubeId}` },
  },
  {
    input: `https://youtube.com/shorts/${youtubeId}/?feature=share`,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://www.youtube.com/shorts/${youtubeId}` },
  },
  {
    input: `https://youtu.be/${youtubeId}?si=abc123`,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://youtu.be/${youtubeId}` },
  },
  {
    input: `https://www.instagram.com/reel/${instagramCode}/`,
    expected: { status: 'recognized', platform: 'instagram', platformVideoId: instagramCode, url: `https://www.instagram.com/reel/${instagramCode}/` },
  },
  {
    input: `https://instagram.com/reels/${instagramCode}?igsh=tracking`,
    expected: { status: 'recognized', platform: 'instagram', platformVideoId: instagramCode, url: `https://www.instagram.com/reels/${instagramCode}/` },
  },
  {
    input: `https://www.instagram.com/p/${instagramCode}/#top`,
    expected: { status: 'recognized', platform: 'instagram', platformVideoId: instagramCode, url: `https://www.instagram.com/p/${instagramCode}/` },
  },
  {
    input: `https://www.tiktok.com/@some.user_1/video/${tiktokId}?is_from_webapp=1`,
    expected: { status: 'recognized', platform: 'tiktok', platformVideoId: tiktokId, url: `https://www.tiktok.com/@some.user_1/video/${tiktokId}` },
  },
  {
    input: `https://tiktok.com/@creator/video/${tiktokId}/`,
    expected: { status: 'recognized', platform: 'tiktok', platformVideoId: tiktokId, url: `https://www.tiktok.com/@creator/video/${tiktokId}` },
  },
  {
    input: `   https://youtu.be/${youtubeId}   `,
    expected: { status: 'recognized', platform: 'youtube', platformVideoId: youtubeId, url: `https://youtu.be/${youtubeId}` },
  },
];

const notRecognized: readonly string[] = [
  '',
  '   ',
  'not a url',
  `http://www.youtube.com/watch?v=${youtubeId}`,
  `ftp://www.youtube.com/watch?v=${youtubeId}`,
  'javascript:alert(1)',
  `https://user:secret@www.youtube.com/watch?v=${youtubeId}`,
  `https://user@www.youtube.com/watch?v=${youtubeId}`,
  `https://www.youtube.com:8443/watch?v=${youtubeId}`,
  `https://vimeo.com/123456789`,
  `https://youtube.com.evil.example/watch?v=${youtubeId}`,
  `https://evil.example/www.youtube.com/watch?v=${youtubeId}`,
  `https://www.youtube.com/watch`,
  `https://www.youtube.com/watch?v=${youtubeId}&v=${youtubeId}`,
  `https://www.youtube.com/watch?v=short`,
  `https://www.youtube.com/watch?v=${youtubeId}X`,
  `https://www.youtube.com/embed/${youtubeId}`,
  `https://www.youtube.com/shorts/${youtubeId}/extra`,
  `https://youtu.be/`,
  `https://youtu.be/${youtubeId}/extra`,
  `https://www.instagram.com/stories/someone/123/`,
  `https://www.instagram.com/reel/abcd/`,
  `https://www.instagram.com/someone/`,
  `https://www.tiktok.com/@${'a'.repeat(25)}/video/${tiktokId}`,
  `https://www.tiktok.com/@creator/video/1234567`,
  `https://www.tiktok.com/@creator/video/12345678abc`,
  `https://www.tiktok.com/@creator/photo/${tiktokId}`,
  `https://www.tiktok.com/video/${tiktokId}`,
  `https://www.youtube.com/watch?v=${youtubeId}&pad=${'x'.repeat(300)}`,
];

const shortLinks: readonly string[] = [
  'https://vm.tiktok.com/ZMabc123/',
  'https://vt.tiktok.com/ZSabc123/',
  'http://vm.tiktok.com/ZMabc123/',
  'https://www.tiktok.com/t/ZT8abcdef/',
  'https://tiktok.com/t/ZT8abcdef',
  `https://instagr.am/p/${instagramCode}/`,
  'https://bit.ly/3abcdef',
  'https://t.co/abcdef',
  'https://tinyurl.com/abcdef',
  'https://goo.gl/abcdef',
];

describe('parsePublicationUrl', () => {
  for (const { input, expected } of accepted) {
    it(`recognizes ${JSON.stringify(input)}`, () => {
      assert.deepEqual(parsePublicationUrl(input), expected);
    });
  }

  for (const input of notRecognized) {
    it(`refuses ${JSON.stringify(input.slice(0, 80))} as not recognized`, () => {
      assert.deepEqual(parsePublicationUrl(input), { status: 'refused', reason: 'publication-url-not-recognized' });
    });
  }

  for (const input of shortLinks) {
    it(`refuses the short link ${JSON.stringify(input)} without resolving it`, () => {
      assert.deepEqual(parsePublicationUrl(input), { status: 'refused', reason: 'publication-short-link-refused' });
    });
  }

  it('keeps no query string, fragment or owner text in the canonical URL', () => {
    const parsed = parsePublicationUrl(`https://www.instagram.com/reel/${instagramCode}/?utm_source=ig&x=<script>#frag`);
    if (parsed.status !== 'recognized') assert.fail('expected a recognized URL');
    assert.equal(parsed.url.includes('?'), false);
    assert.equal(parsed.url.includes('#'), false);
    assert.equal(parsed.url.includes('script'), false);
  });

  it('accepts a URL of exactly 300 characters and refuses 301', () => {
    const base = `https://www.youtube.com/watch?v=${youtubeId}&p=`;
    const atLimit = base + 'x'.repeat(300 - base.length);
    assert.equal(atLimit.length, 300);
    assert.equal(parsePublicationUrl(atLimit).status, 'recognized');
    assert.deepEqual(parsePublicationUrl(`${atLimit}x`), { status: 'refused', reason: 'publication-url-not-recognized' });
  });
});
