import { ReviewVerdictSchema, ScenesOutputSchema, ScriptOutputSchema } from '@studio/shared/agents';
import { reviewVerdictPath } from '@studio/shared/run-format';
import { mockCaptures } from '../fixtures/agent-output.fixtures';
import { directorPacket, reviewPacket } from './agent-packets';
import { MockCapturesIndexSchema, MockNarrationIndexSchema, readStageInput } from './mock-artifacts';
import { emitReviewVerdict, recordModelSession, recordTtsSession } from './mock-sessions';
import { bytesWrite, jsonWrite, mockMediaBytes, stageOutput, zeroEstimate, type MockStageBehaviour } from './mock-stage-behaviour';

const JSON_MIME = 'application/json';

/** No browser and no network: the brief's sourceUrl is recorded, never fetched (R1-04). */
export const captureBehaviour: MockStageBehaviour = {
  stageId: 'capture',
  provider: 'capture',
  estimate: zeroEstimate,
  outputs: (location) => [stageOutput(location, 'captures-index', 'captures-index.json', JSON_MIME)],
  produce: async (context) => [
    jsonWrite('captures-index', MockCapturesIndexSchema, { sourceUrl: context.brief.sourceUrl ?? null, captures: mockCaptures }),
  ],
  summary: 'Três capturas simuladas do app, sem abrir navegador.',
};

export const scenesBehaviour: MockStageBehaviour = {
  stageId: 'scenes',
  provider: 'claude',
  estimate: zeroEstimate,
  outputs: (location) => [
    stageOutput(location, 'scenes', 'scenes.json', JSON_MIME),
    { name: 'review-scenes', path: reviewVerdictPath('scenes'), mimeType: JSON_MIME },
  ],
  produce: async (context, tools) => {
    const script = await readStageInput(context, 'script', ScriptOutputSchema);
    const captures = await readStageInput(context, 'captures-index', MockCapturesIndexSchema);
    const scenes = await tools.agents.run('director', directorPacket(context, script, captures.captures), { signal: context.signal });
    await recordModelSession(context, tools, 'director');
    const verdict = await tools.agents.run('evaluator', reviewPacket(context, 'scenes'), { signal: context.signal });
    await recordModelSession(context, tools, 'evaluator');
    await emitReviewVerdict(context, 'scenes', verdict);
    return [jsonWrite('scenes', ScenesOutputSchema, scenes), jsonWrite('review-scenes', ReviewVerdictSchema, verdict)];
  },
  summary: 'Cenas simuladas sobre as capturas, citando só ativos oferecidos.',
  evidence: { 'refs-resolve': 'todas as referências citadas resolvem', 'reviewer-score': 'nota geral 4' },
};

export const narrationBehaviour: MockStageBehaviour = {
  stageId: 'narration',
  provider: 'local-voice',
  estimate: zeroEstimate,
  outputs: (location) => [
    stageOutput(location, 'narration-index', 'narration-index.json', JSON_MIME),
    stageOutput(location, 'narration-audio', 'narration.wav', 'audio/wav'),
  ],
  produce: async (context, tools) => {
    const script = await readStageInput(context, 'script', ScriptOutputSchema);
    const lines = script.scenes.map((scene) => ({ sceneId: scene.sceneId, characters: scene.narration.length }));
    await recordTtsSession(context, tools, lines.reduce((total, line) => total + line.characters, 0));
    return [
      jsonWrite('narration-index', MockNarrationIndexSchema, { voice: 'mock-voice', lines }),
      bytesWrite('narration-audio', mockMediaBytes('narration')),
    ];
  },
  summary: 'Narração simulada, uma linha por cena.',
};
