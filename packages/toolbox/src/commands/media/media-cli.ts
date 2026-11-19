import type { Command } from 'commander';
import type { CommandContext, CommandOutcome } from '../../cli/context';
import { InputError } from '../../errors';
import { runCaptionBurn } from './caption-burn';
import { runFades } from './fades';
import { runMediaReview } from './media-review';
import { runMusicBed } from './music-bed';

type RunHandler = (handler: (context: CommandContext) => Promise<CommandOutcome>) => Promise<void>;

/** Exit 1 for a failed review, after the report was printed, so shell callers can branch on it. */
class MediaReviewFailedError extends InputError {
  constructor(failedChecks: readonly string[]) {
    super(`media review failed: ${failedChecks.join(', ')}`, 'fix the failed checks in the report above and re-run ace media-review');
    this.name = 'MediaReviewFailedError';
  }
}

/** Commander already camel-cases the flags into the C9 argument names (--fade-in-s -> fadeInS). */
function withPaths(options: unknown, paths: Record<string, string>): unknown {
  return typeof options === 'object' && options !== null ? { ...options, ...paths } : paths;
}

/** The C9 result is one JSON line on stdout; the CLI's own status line still comes last. */
function printResult(result: object, next: string): CommandOutcome {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return { runId: null, state: null, next };
}

/** `music-bed`, `fades`, `caption-burn` and `media-review` (contract C9, see ./README.md). Run-agnostic: no run.json is read or written. */
export function registerMediaCommands(program: Command, run: RunHandler): void {
  program
    .command('music-bed')
    .description('loop a music bed under the video, duck it under speech, normalise loudness -> new .mp4')
    .argument('<input>', 'video file')
    .argument('<output>', 'new .mp4 path (never overwritten)')
    .requiredOption('--music <file>', 'music file')
    .option('--volume <0-2>', 'bed volume before ducking (default 0.25)')
    .option('--fade-in-s <seconds>', 'bed fade in (default 1.0)')
    .option('--fade-out-s <seconds>', 'bed fade out (default 1.5)')
    .option('--loudness-target-lufs <lufs>', 'integrated loudness target (default -16)')
    .option('--true-peak-target-db <db>', 'loudnorm true-peak target (default -1.5)')
    .option('--no-duck', 'keep the bed level under speech')
    .action((input: string, output: string, options: unknown) =>
      run(async (context) => printResult(await runMusicBed(context.env, withPaths(options, { input, output })), 'run ace media-review on the output')),
    );

  program
    .command('fades')
    .description('picture fade in from and out to black -> new .mp4')
    .argument('<input>', 'video file')
    .argument('<output>', 'new .mp4 path (never overwritten)')
    .option('--fade-in-s <seconds>', 'fade in (default 0.4)')
    .option('--fade-out-s <seconds>', 'fade out (default 0.4)')
    .action((input: string, output: string, options: unknown) =>
      run(async (context) => printResult(await runFades(context.env, withPaths(options, { input, output })), 'run ace media-review on the output')),
    );

  program
    .command('caption-burn')
    .description('draw an SRT onto the video as overlaid images -> new .mp4')
    .argument('<input>', 'video file')
    .argument('<output>', 'new .mp4 path (never overwritten)')
    .requiredOption('--srt <file>', 'SRT built from the narration word timings')
    .requiredOption('--vertical-anchor <0-1>', 'caption centre as a fraction of the frame height, from the recipe format')
    .option('--style <style>', 'bold | highlight | box (default bold)')
    .option('--font-file <file>', '.ttf or .otf font (default: Arial-first system stack)')
    .option('--font-size-px <px>', 'font size (default 7.5% of the shorter frame side, at least 24)')
    .action((input: string, output: string, options: unknown) =>
      run(async (context) => printResult(await runCaptionBurn(context.env, withPaths(options, { input, output })), 'run ace media-review on the output')),
    );

  program
    .command('media-review')
    .description('check container, codecs, resolution, fps, duration, loudness, true peak, audio and black runs -> JSON report')
    .argument('<input>', 'video file')
    .requiredOption('--width <px>', 'expected width')
    .requiredOption('--height <px>', 'expected height')
    .requiredOption('--fps <fps>', 'expected frame rate')
    .requiredOption('--min-duration-s <seconds>', 'shortest accepted duration')
    .requiredOption('--max-duration-s <seconds>', 'longest accepted duration')
    .option('--container <name>', 'mp4 | mov (default mp4)')
    .option('--video-codec <name>', 'default h264')
    .option('--audio-codec <name>', 'default aac')
    .option('--loudness-target-lufs <lufs>', 'default -16')
    .option('--loudness-tolerance-lu <lu>', 'default 1')
    .option('--true-peak-ceiling-dbfs <db>', 'default -1')
    .option('--max-black-run-s <seconds>', 'default 1')
    .action((input: string, options: unknown) =>
      run(async (context) => {
        const report = await runMediaReview(context.env, withPaths(options, { input }));
        const outcome = printResult(report, 'the file passed every media check');
        if (!report.passed) throw new MediaReviewFailedError(report.checks.filter((check) => !check.passed).map((check) => check.id));
        return outcome;
      }),
    );
}
