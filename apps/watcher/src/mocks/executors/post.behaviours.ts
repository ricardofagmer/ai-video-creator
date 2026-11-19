import { ScriptOutputSchema } from '@studio/shared/agents';
import { readStageInput } from './mock-artifacts';
import { recordRenderSession } from './mock-sessions';
import { bytesWrite, mockMediaBytes, stageOutput, zeroEstimate, type MockStageBehaviour } from './mock-stage-behaviour';

const VIDEO_MIME = 'video/mp4';

function srtTime(totalMs: number): string {
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  const pad = (value: number, width: number): string => String(value).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

export const compositionBehaviour: MockStageBehaviour = {
  stageId: 'composition',
  provider: 'render',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'composition', 'composition.mp4', VIDEO_MIME)],
  produce: async (context, tools) => {
    const script = await readStageInput(context, 'script', ScriptOutputSchema);
    await recordRenderSession(context, tools, script.totalEstDurationSec);
    return [bytesWrite('composition', mockMediaBytes('composition'))];
  },
  summary: 'Composição simulada no modelo do tour.',
};

/** Captions follow the script's estimated scene durations, one cue per scene. */
export const captionsBehaviour: MockStageBehaviour = {
  stageId: 'captions',
  provider: 'render',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'captions', 'captions.srt', 'application/x-subrip')],
  produce: async (context) => {
    const script = await readStageInput(context, 'script', ScriptOutputSchema);
    let startMs = 0;
    const cues = script.scenes.map((scene, index) => {
      const endMs = startMs + Math.round(scene.estDurationSec * 1000);
      const cue = `${index + 1}\n${srtTime(startMs)} --> ${srtTime(endMs)}\n${scene.narration}\n`;
      startMs = endMs;
      return cue;
    });
    return [bytesWrite('captions', cues.join('\n'))];
  },
  summary: 'Legendas simuladas, uma por cena.',
  evidence: { 'caption-timing': 'desvio máximo 0 ms' },
};

export const fadesBehaviour: MockStageBehaviour = {
  stageId: 'fades',
  provider: 'render',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'fades', 'fades.mp4', VIDEO_MIME)],
  produce: async () => [bytesWrite('fades', mockMediaBytes('fades'))],
  summary: 'Transições simuladas aplicadas.',
};

export const musicBehaviour: MockStageBehaviour = {
  stageId: 'music',
  provider: 'render',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'music', 'music.mp4', VIDEO_MIME)],
  produce: async () => [bytesWrite('music', mockMediaBytes('music'))],
  summary: 'Trilha vinculada mixada (simulado).',
};
