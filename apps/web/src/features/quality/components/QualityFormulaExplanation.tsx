import { QUALITY_SCORE_FORMULA_VERSION, qualityScoreWeights } from '@studio/shared/catalog';
import { platformSignalRules } from '@studio/shared/metrics';
import type { ReactElement } from 'react';
import { formatScoreValue } from '../quality-labels';

const weightFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function weight(value: number): string {
  return weightFormatter.format(value);
}

/**
 * "Como a nota é calculada" (SPEC 0003 section 5.1, SPEC 0006 section 5.4): the formula and its
 * known limits, written from the shared constants (`qualityScoreWeights`, `platformSignalRules`),
 * so the text cannot drift from what core computes. A native `<details>` keeps it out of the way
 * and keyboard reachable.
 */
export function QualityFormulaExplanation(): ReactElement {
  const weights = qualityScoreWeights;
  const { minViews, baselineMinVideos } = platformSignalRules;
  // The largest nudges of SPEC 0006 L3, derived from the weights so they move with them.
  const largestRaise = weights.reviewer + weights.qa + weights.platform;
  const largestCut = -(weights.reviewer + weights.qa + weights.recovery + weights.platform);
  return (
    <details>
      <summary className="label">Como a nota é calculada</summary>
      <div className="body-sm">
        <p>
          A nota vai de 1 a 5 e parte da sua avaliação (1 a 5 estrelas) de cada execução revisada que usou a versão. Três sinais do
          estúdio só ajustam um pouco cada execução: a nota do revisor (peso {weight(weights.reviewer)}), as checagens de qualidade
          (peso {weight(weights.qa)}: aprovadas somam, aprovadas com avisos subtraem) e as recuperações durante a execução (peso{' '}
          {weight(weights.recovery)}, contando no máximo {weights.recoveryCap}). Juntos, eles não chegam a meia estrela.
        </p>
        <p>
          Quando o vídeo de uma execução foi publicado e tem métricas, as plataformas entram como um quarto sinal (peso{' '}
          {weight(weights.platform)}): visualizações, taxa de engajamento e, quando a plataforma informa, a porcentagem assistida, sempre
          comparadas com a mediana dos seus próprios vídeos naquela plataforma, nunca com um número absoluto. Só contam vídeos com pelo
          menos {minViews} visualizações. Sem efeito na nota até haver {baselineMinVideos} vídeos com métricas na mesma plataforma. Com
          os quatro sinais juntos, o ajuste de uma execução fica entre {formatSignedWeight(largestCut)} e {formatSignedWeight(largestRaise)}; a sua
          avaliação continua mandando.
        </p>
        <p>
          Com poucas execuções, a nota é puxada para uma média de referência, que conta como {weights.priorWeight} execuções: a média da
          receita, se ela tiver ao menos {weights.priorMinRuns} execuções revisadas; senão a do tipo de ativo; senão a de todo o estúdio;
          senão {formatScoreValue(weights.priorNeutral)}. Por isso uma única execução com 5 estrelas não vira uma nota 5.
        </p>
        <p>
          Limites conhecidos: a nota atribui o resultado da execução inteira a cada versão que ela usou; execuções que falharam antes
          da revisão não entram na conta; e, como toda execução revisada já passou nas checagens de mídia, as checagens só separam
          &quot;aprovada&quot; de &quot;aprovada com avisos&quot;. A nota é recalculada a cada revisão registrada e a cada importação
          de métricas, e nunca ativa nada sozinha. Versão da fórmula: {QUALITY_SCORE_FORMULA_VERSION}.
        </p>
      </div>
    </details>
  );
}

/** "-0,70" / "+0,60": the bounds of SPEC 0006 L3, signed so the direction is explicit. */
function formatSignedWeight(value: number): string {
  return `${value > 0 ? '+' : ''}${weight(value)}`;
}
