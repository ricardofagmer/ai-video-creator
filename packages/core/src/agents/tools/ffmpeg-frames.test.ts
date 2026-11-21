import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { demuxerFor, extractJpegFrame, localInputArguments, probeDurationMs, type ProcessSignals } from './ffmpeg-frames';

/*
 * Baseline review L4 (2026-11-21): ffmpeg and ffprobe restricted only the protocol, so a crafted
 * playlist or concat file could still make the demuxer open other local files. The input demuxer
 * is now pinned per container and anything else is refused before a process starts. No process
 * runs in these tests: every refused path returns before `execFile`.
 */

const MOV_FAMILY = 'mov,mp4,m4a,3gp,3g2,mj2';

function idleSignals(): ProcessSignals {
  return { caller: new AbortController().signal, deadline: new AbortController().signal };
}

describe('ffmpeg input pinning (baseline L4)', () => {
  it('pins the mov family for mp4 and mov and matroska for webm, in any letter case', () => {
    assert.equal(demuxerFor('/runs/r/composition.mp4'), MOV_FAMILY);
    assert.equal(demuxerFor('/runs/r/capture.MOV'), MOV_FAMILY);
    assert.equal(demuxerFor('/runs/r/capture.webm'), 'matroska,webm');
  });

  it('has no demuxer for playlists, concat lists, image patterns or extensionless files', () => {
    for (const path of ['/runs/r/a.m3u8', '/runs/r/list.txt', '/runs/r/list.ffconcat', '/runs/r/frame-%03d.png', '/runs/r/composition', '/runs/r/a.mp4.m3u8']) {
      assert.equal(demuxerFor(path), null, path);
    }
  });

  it('puts the protocol whitelist and the pinned demuxer before the input', () => {
    assert.deepEqual(localInputArguments('/runs/r/composition.mp4'), [
      '-protocol_whitelist',
      'file',
      '-f',
      MOV_FAMILY,
      '-i',
      'file:/runs/r/composition.mp4',
    ]);
    assert.equal(localInputArguments('/runs/r/playlist.m3u8'), null);
  });

  it('refuses an unpinned container in ffprobe and ffmpeg without starting a process', async () => {
    const probe = await probeDurationMs('/runs/r/playlist.m3u8', idleSignals());
    assert.deepEqual(probe, { status: 'failed', reason: 'bad-output', stderrTail: '' });
    const frame = await extractJpegFrame({ sourcePath: '/runs/r/list.ffconcat', timestampMs: 0, maxEdgePx: 512 }, idleSignals());
    assert.deepEqual(frame, { status: 'failed', reason: 'bad-output', stderrTail: '' });
  });
});
