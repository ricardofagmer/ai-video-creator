import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkPicture, type PictureCheckRequest, type PictureExpectation, type RunProbe } from './picture-check';

/*
 * The post-render picture check (SPEC 0008 section 5.2 step 4), tested through `checkPicture` with
 * a fake `RunProbe`: no ffprobe starts, and the probe parser and the comparison stay private.
 */

const FFPROBE_BIN = '/fixture/bin/ffprobe';
const PICTURE = '/fixture/scratch/render-0001/picture.mp4';
const EXPECTED: PictureExpectation = { width: 1080, height: 1920, fps: 30, durationS: 10 };

interface ProbeFields {
  codec_name?: unknown;
  pix_fmt?: unknown;
  width?: unknown;
  height?: unknown;
  avg_frame_rate?: unknown;
}

const GOOD_STREAM: ProbeFields = { codec_name: 'h264', pix_fmt: 'yuv420p', width: 1080, height: 1920, avg_frame_rate: '30/1' };

function probeJson(stream: ProbeFields = {}, duration: unknown = '10.000000'): string {
  return JSON.stringify({ streams: [{ ...GOOD_STREAM, ...stream }], format: { duration } });
}

interface ProbeCall {
  program: string;
  args: readonly string[];
}

function fakeRun(stdout: string): { run: RunProbe; calls: ProbeCall[] } {
  const calls: ProbeCall[] = [];
  const run: RunProbe = (program, args) => {
    calls.push({ program, args });
    return Promise.resolve(stdout);
  };
  return { run, calls };
}

function request(expected: PictureExpectation = EXPECTED): PictureCheckRequest {
  return { ffprobeBin: FFPROBE_BIN, file: PICTURE, expected };
}

async function mismatchesOf(stdout: string, expected: PictureExpectation = EXPECTED): Promise<readonly string[]> {
  return (await checkPicture(request(expected), fakeRun(stdout).run)).mismatches;
}

describe('checkPicture: the probe it runs', () => {
  it('runs the resolved ffprobe once with the file-input guard and the picture last', async () => {
    const { run, calls } = fakeRun(probeJson());

    await checkPicture(request(), run);

    assert.deepEqual(calls, [
      {
        program: FFPROBE_BIN,
        args: [
          '-v',
          'error',
          '-protocol_whitelist',
          'file',
          '-format_whitelist',
          'mov,mp4,matroska,webm,mp3,wav,aac,flac,ogg,aiff',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration',
          '-of',
          'json',
          PICTURE,
        ],
      },
    ]);
  });

  it('lets a failure of the probe run itself pass through', async () => {
    const failing: RunProbe = () => Promise.reject(new Error('ffprobe exited 1'));

    await assert.rejects(checkPicture(request(), failing), /ffprobe exited 1/);
  });
});

describe('checkPicture: a picture that matches', () => {
  it('answers the probe and no mismatch', async () => {
    const answer = await checkPicture(request(), fakeRun(probeJson()).run);

    assert.deepEqual(answer, {
      probe: { codec: 'h264', pixelFormat: 'yuv420p', width: 1080, height: 1920, fps: 30, durationS: 10 },
      mismatches: [],
    });
  });

  it('accepts a picture exactly one frame short (pictureFrameTolerance 1)', async () => {
    assert.deepEqual(await mismatchesOf(probeJson({}, String(EXPECTED.durationS - 1 / EXPECTED.fps))), []);
  });

  it('accepts a picture longer than expected', async () => {
    assert.deepEqual(await mismatchesOf(probeJson({}, '12.500000')), []);
  });

  it('accepts a frame rate within 0.01 of the expected one', async () => {
    assert.deepEqual(await mismatchesOf(probeJson({ avg_frame_rate: '30005/1000' })), []);
  });
});

describe('checkPicture: each mismatch', () => {
  const cases: readonly { name: string; stdout: string; mismatches: readonly string[] }[] = [
    { name: 'a codec other than h264', stdout: probeJson({ codec_name: 'hevc' }), mismatches: ['codec'] },
    { name: 'a pixel format other than yuv420p', stdout: probeJson({ pix_fmt: 'yuv444p' }), mismatches: ['pixel-format'] },
    { name: 'the wrong width only', stdout: probeJson({ width: 1920 }), mismatches: ['size'] },
    { name: 'the wrong height only', stdout: probeJson({ height: 1080 }), mismatches: ['size'] },
    { name: 'a frame rate more than 0.01 off (29.97)', stdout: probeJson({ avg_frame_rate: '30000/1001' }), mismatches: ['fps'] },
    { name: 'a frame rate 0.02 above', stdout: probeJson({ avg_frame_rate: '3002/100' }), mismatches: ['fps'] },
    { name: 'a picture more than one frame short', stdout: probeJson({}, '9.950000'), mismatches: ['duration'] },
    {
      name: 'every field wrong at once, in check order',
      stdout: probeJson({ codec_name: 'vp9', pix_fmt: 'rgb24', width: 640, height: 480, avg_frame_rate: '24/1' }, '1.0'),
      mismatches: ['codec', 'pixel-format', 'size', 'fps', 'duration'],
    },
  ];

  for (const { name, stdout, mismatches } of cases) {
    it(`reports ${mismatches.join(', ')} for ${name}`, async () => {
      assert.deepEqual(await mismatchesOf(stdout), mismatches);
    });
  }

  it('judges one frame of tolerance by the expected frame rate', async () => {
    const at24: PictureExpectation = { ...EXPECTED, fps: 24, durationS: 10 };

    assert.deepEqual(await mismatchesOf(probeJson({ avg_frame_rate: '24/1' }, '9.960000'), at24), []);
    assert.deepEqual(await mismatchesOf(probeJson({ avg_frame_rate: '24/1' }, '9.950000'), at24), ['duration']);
  });
});

describe('checkPicture: ffprobe output it cannot read', () => {
  const unreadable: readonly { name: string; stdout: string }[] = [
    { name: 'output that is not JSON', stdout: '{"streams": [' },
    { name: 'no streams field', stdout: JSON.stringify({ format: { duration: '10.0' } }) },
    { name: 'an empty streams list', stdout: JSON.stringify({ streams: [], format: { duration: '10.0' } }) },
    { name: 'streams that is not a list', stdout: JSON.stringify({ streams: { codec_name: 'h264' }, format: { duration: '10.0' } }) },
    { name: 'a missing codec', stdout: probeJson({ codec_name: undefined }) },
    { name: 'a numeric codec', stdout: probeJson({ codec_name: 264 }) },
    { name: 'a missing pixel format', stdout: probeJson({ pix_fmt: undefined }) },
    { name: 'a width given as text', stdout: probeJson({ width: '1080' }) },
    { name: 'a height given as text', stdout: probeJson({ height: '1920' }) },
    { name: 'a frame rate with a zero denominator', stdout: probeJson({ avg_frame_rate: '30/0' }) },
    { name: 'a frame rate without a denominator', stdout: probeJson({ avg_frame_rate: '30' }) },
    { name: 'a frame rate given as a number', stdout: probeJson({ avg_frame_rate: 30 }) },
    { name: 'a frame rate that is not a number', stdout: probeJson({ avg_frame_rate: 'abc/1' }) },
    { name: 'a missing duration', stdout: JSON.stringify({ streams: [GOOD_STREAM], format: {} }) },
    { name: 'no format field', stdout: JSON.stringify({ streams: [GOOD_STREAM] }) },
    { name: 'a duration given as a number', stdout: probeJson({}, 10) },
    { name: 'a duration that is not a number', stdout: probeJson({}, 'N/A') },
  ];

  for (const { name, stdout } of unreadable) {
    it(`answers unreadable with no probe for ${name}`, async () => {
      assert.deepEqual(await checkPicture(request(), fakeRun(stdout).run), { probe: null, mismatches: ['unreadable'] });
    });
  }
});
