import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { HookLangSchema, HookVoiceModeSchema } from '@studio/shared/ace';
import { isHookVideoId, renderHook } from '@ace/video';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { InputError } from '../errors';
import { mixHookAudio } from '../hooks/audio/mixdown';
import { composeScore } from '../hooks/audio/score';
import { checkHookVideo } from '../hooks/hook-qa';
import { narrateLines, type NarrationLine } from '../hooks/hook-voice';
import { layoutTimeline } from '../hooks/layout-timeline';
import { storyboards } from '../hooks/storyboards';
import { startStaticServer } from '../render/static-server';

const HookOptionsSchema = z.object({
  lang: HookLangSchema,
  voice: HookVoiceModeSchema.default('draft'),
});

/**
 * `ace hook <id> --lang pt|en --voice draft|live`: narration, beat-locked timeline, score and
 * mix, video.mp4, cover.png, carousel or avatar PNGs (when the hook has them) and QA into out/hooks/<id>-<lang>/. Hooks live
 * outside the run state machine (ADR 0003): no run.json, nothing is ever posted.
 */
export async function hookCommand(context: CommandContext, videoId: string, rawOptions: unknown): Promise<CommandOutcome> {
  const storyboard = storyboards[videoId];
  if (!storyboard || !isHookVideoId(videoId)) {
    throw new InputError(`unknown hook "${videoId}"; known: ${Object.keys(storyboards).join(', ')}`, 'run ace hook --help');
  }
  const parsed = HookOptionsSchema.safeParse(rawOptions);
  if (!parsed.success) throw new InputError(`invalid options: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`, 'use --lang pt|en and --voice draft|live');
  const { lang, voice } = parsed.data;

  const outDir = join(context.env.repoRoot, 'out', 'hooks', `${videoId}-${lang}`);
  const voiceDir = join(outDir, 'voice');
  const audioDir = join(outDir, 'audio');
  await mkdir(voiceDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });

  const lines: NarrationLine[] = storyboard.shots.flatMap((shot) => (shot.line ? [{ shotId: shot.id, text: shot.line.text[lang] }] : []));
  context.log(`narrating ${lines.length} lines (${voice})`);
  const narration = await narrateLines({ env: context.env, lang, voice, lines, dir: voiceDir, log: (message) => context.log(message) });
  if (voice === 'live') context.log(`${context.env.voiceEngine} voice: ${narration.characters} characters, about $${narration.usdEstimate.toFixed(2)}`);

  const { timeline, placements } = layoutTimeline({
    storyboard,
    lang,
    voice,
    clips: narration.clips.map((clip) => ({ shotId: clip.shotId, words: clip.words })),
  });
  await writeFile(join(outDir, 'timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`);
  context.log(`timeline ${timeline.durationS.toFixed(2)} s, ${timeline.totalBeats} beats at ${timeline.bpm} BPM`);

  const voiceClips = placements.map((placement) => {
    const clip = narration.clips.find((candidate) => candidate.shotId === placement.shotId);
    if (!clip) throw new InputError(`no narration clip for shot ${placement.shotId}`);
    return { path: clip.path, offsetS: placement.offsetS };
  });
  const { music, sfx } = composeScore(timeline);
  const mix = await mixHookAudio({ music, sfx, voiceClips, durationS: timeline.durationS, workDir: audioDir, ffmpegPath: context.env.ffmpegPath });
  context.log(`mix ${mix.integratedLufs.toFixed(1)} LUFS, ${mix.truePeakDb.toFixed(1)} dBTP`);

  const server = await startStaticServer(outDir);
  const render = await (async () => {
    try {
      const audioUrl = `${server.baseUrl}/${relative(outDir, mix.masterPath).split('\\').join('/')}`;
      return await renderHook({ videoId, input: { ...timeline, audioUrl, slide: 1 }, outDir });
    } finally {
      await server.close();
    }
  })();
  const extras = [render.carouselPaths.length > 0 ? `${render.carouselPaths.length} slides` : null, render.avatarPath ? 'avatar' : null].filter(Boolean);
  context.log(`rendered video, cover${extras.length > 0 ? `, ${extras.join(', ')}` : ''} in ${render.renderSeconds.toFixed(0)} s`);

  const qa = await checkHookVideo({ ffmpegPath: context.env.ffmpegPath, ffprobePath: context.env.ffprobePath, videoPath: render.videoPath, timeline, outDir });
  for (const check of qa.checks) context.log(`${check.pass ? 'pass' : 'FAIL'} ${check.name}: ${check.detail}`);
  if (!qa.pass) throw new InputError(`hook QA failed; see ${join(outDir, 'qa.json')}`, `fix the failed checks and re-run ace hook ${videoId} --lang ${lang}`);
  return { runId: null, state: null, next: `review ${relative(context.env.repoRoot, render.videoPath)} and the contact sheet` };
}
