import { type ReferenceStyleAnalysis } from '@studio/shared/agents';

/** Room left for the item name inside the 600-character summary. */
const NAME_IN_SUMMARY_MAX_CHARS = 200;

/**
 * Stand-in analysis of mock mode (ADR 0002 "Mock by default"): built from the item name only, no
 * frame is read and no connection opens. The summary starts with "Simulado" and every other field
 * says it is simulated, so a mock analysis can never pass for one that looked at the video.
 */
export function mockReferenceStyleAnalysis(name: string): ReferenceStyleAnalysis {
  const shownName = name.trim().slice(0, NAME_IN_SUMMARY_MAX_CHARS) || 'referência sem nome';
  return {
    summary: `Simulado: análise de exemplo da referência "${shownName}"; nenhum quadro do vídeo foi analisado.`,
    hook: 'Simulado: abertura com uma frase curta e direta nos primeiros segundos.',
    pacing: 'Simulado: cortes a cada 2 a 3 segundos.',
    shots: ['Simulado: plano fechado do assunto principal', 'Simulado: cartela de título'],
    onScreenText: 'Simulado: legendas curtas, centralizadas, em fonte grande.',
    visualStyle: 'Simulado: cores neutras, enquadramento vertical, movimento leve de câmera.',
    promptNotes: ['Simulado: use frases curtas e um ritmo de cortes rápido, como na referência.'],
    cautions: [],
  };
}
