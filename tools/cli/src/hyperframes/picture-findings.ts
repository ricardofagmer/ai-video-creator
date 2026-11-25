import { type PictureCheck, type PictureExpectation } from '@studio/hyperframes';
import { cliText } from '../i18n/messages.js';

/**
 * The trace findings of a picture check (`checkPicture` of `@studio/hyperframes`) in the active
 * language; empty when the picture is what was expected.
 */
export function pictureFindings(check: PictureCheck, expected: PictureExpectation): string[] {
  const { findings, picture } = cliText().hyperframes;
  const { probe } = check;
  if (probe === null) return [findings.videoUnreadable];
  return check.mismatches.map((mismatch) => {
    switch (mismatch) {
      case 'unreadable':
        return findings.videoUnreadable;
      case 'codec':
        return findings.video(picture.codec(probe.codec));
      case 'pixel-format':
        return findings.video(picture.pixelFormat(probe.pixelFormat));
      case 'size':
        return findings.video(picture.size(`${probe.width}x${probe.height}`, `${expected.width}x${expected.height}`));
      case 'fps':
        return findings.video(picture.fps(probe.fps.toFixed(2), expected.fps));
      case 'duration':
        return findings.video(picture.duration(probe.durationS.toFixed(2), expected.durationS));
    }
  });
}
