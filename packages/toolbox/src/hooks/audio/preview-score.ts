import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HookTimelineSchema } from '@studio/shared/ace';
import { mixHookAudio } from './mixdown';
import { composeScore } from './score';

/** Dev entry: npx tsx src/hooks/audio/preview-score.ts <timeline.json> <outDir> */
async function main(): Promise<void> {
  const [timelinePath, outDir] = process.argv.slice(2);
  if (!timelinePath || !outDir) throw new Error('usage: preview-score <timeline.json> <outDir>');
  const timeline = HookTimelineSchema.parse(JSON.parse(await readFile(timelinePath, 'utf8')));
  const workDir = resolve(outDir);
  await mkdir(workDir, { recursive: true });
  const { music, sfx } = composeScore(timeline);
  const result = await mixHookAudio({
    music,
    sfx,
    voiceClips: [],
    durationS: timeline.durationS,
    workDir,
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  });
  process.stdout.write(`${result.masterPath}\nintegrated ${result.integratedLufs} LUFS, true peak ${result.truePeakDb} dBTP\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
