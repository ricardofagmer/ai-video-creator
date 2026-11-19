export interface CaptionCue {
  startS: number;
  endS: number;
  text: string;
}

const TIME_PATTERN = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/;
const TAG_PATTERN = /<[^>]+>/g;

function toSeconds(parts: { hours?: string; minutes?: string; seconds?: string; millis?: string }): number {
  const millis = (parts.millis ?? '0').padEnd(3, '0');
  return (
    Number.parseInt(parts.hours ?? '0', 10) * 3600 +
    Number.parseInt(parts.minutes ?? '0', 10) * 60 +
    Number.parseInt(parts.seconds ?? '0', 10) +
    Number.parseInt(millis, 10) / 1000
  );
}

/**
 * Port of captions.py `parse_srt`: one cue per block, the first timing line opens it, the
 * following lines join into the text, markup tags are dropped, empty or inverted cues are skipped.
 */
export function parseSrt(text: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    const timingIndex = lines.findIndex((line) => TIME_PATTERN.test(line));
    if (timingIndex < 0) continue;
    const match = TIME_PATTERN.exec(lines[timingIndex] ?? '');
    if (!match) continue;
    const startS = toSeconds({ hours: match[1], minutes: match[2], seconds: match[3], millis: match[4] });
    const endS = toSeconds({ hours: match[5], minutes: match[6], seconds: match[7], millis: match[8] });
    const body = lines
      .slice(timingIndex + 1)
      .join(' ')
      .replace(TAG_PATTERN, '')
      .trim();
    if (body.length > 0 && endS > startS) cues.push({ startS, endS, text: body });
  }
  return cues;
}
