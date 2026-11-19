import type { RenderScene, WordTiming } from '@studio/shared/ace';
import { SAMPLE_AUDIO_URL } from '../../theme';
import type { ProductTourInput } from './product-tour-input';

/** Studio-only preview beats: assets null (typographic cards), pt-BR like the recipe. */
const beats: readonly { kind: RenderScene['kind']; onScreenText: string; narration: string; seconds: number }[] = [
  { kind: 'hook', onScreenText: 'Cada vídeo, já com contexto.', narration: 'Cada vídeo, já com contexto.', seconds: 5 },
  { kind: 'step', onScreenText: 'Catálogo de ativos', narration: 'Tudo começa no catálogo, com versões imutáveis.', seconds: 12 },
  { kind: 'step', onScreenText: 'Receitas', narration: 'A receita fixa modelo, voz, trilha e verificações.', seconds: 12 },
  { kind: 'step', onScreenText: 'Execução acompanhada', narration: 'A execução mostra cada etapa e cada verificação.', seconds: 12 },
  { kind: 'step', onScreenText: 'Revisão humana', narration: 'No fim, você revisa, avalia e decide.', seconds: 12 },
  { kind: 'cta', onScreenText: 'Produção com controle.', narration: 'Produção com controle.', seconds: 7 },
];

const WORD_FILL = 0.85;
const LEAD_S = 0.15;
const TRAIL_S = 0.25;

function spreadWords(narration: string, startS: number, endS: number): WordTiming[] {
  const words = narration.split(/\s+/).filter((word) => word !== '');
  const windowStart = startS + LEAD_S;
  const slot = (endS - TRAIL_S - windowStart) / Math.max(1, words.length);
  return words.map((text, index) => {
    const wordStart = windowStart + index * slot;
    return { text, startS: wordStart, endS: wordStart + slot * WORD_FILL };
  });
}

/** Preview props of the ProductTour16x9 composition; production props come from the render plan. */
export function buildProductTourSample(): ProductTourInput {
  const scenes: RenderScene[] = [];
  const captions: WordTiming[] = [];
  let cursorS = 0;
  beats.forEach((beat, index) => {
    const endS = cursorS + beat.seconds;
    scenes.push({ id: `${beat.kind}-${index + 1}`, kind: beat.kind, startS: cursorS, endS, onScreenText: beat.onScreenText, asset: null });
    captions.push(...spreadWords(beat.narration, cursorS, endS));
    cursorS = endS;
  });
  return {
    title: 'Video Studio',
    durationS: cursorS,
    audioUrl: SAMPLE_AUDIO_URL,
    scenes,
    captions,
    disclosure: 'Voz gerada por IA. Demonstração com dados fictícios.',
  };
}
