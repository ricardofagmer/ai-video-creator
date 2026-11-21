import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HyperframesRefusalReasonSchema, type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { hyperframesRefusalText, stageTexts } from './stage-texts';

/*
 * The pt-BR refusal texts of SPEC 0008 section 5.7, one per refusal reason, and the run activity of
 * section 7. Expected strings are copied from the spec table; `{ref}` is the bound template ref.
 */

const REF = 'hf-title-card@1';

const sectionFiveSeven: Readonly<Record<HyperframesRefusalReason, { message: string; whatToDo: string }>> = {
  'engine-disabled': {
    message: 'O motor HyperFrames está desligado.',
    whatToDo: 'Rode `studio hyperframes status` e siga os passos, ou vincule um modelo Remotion.',
  },
  'chrome-missing': { message: 'O Chrome do HyperFrames não está instalado.', whatToDo: 'Rode `studio hyperframes chrome install`.' },
  'runtime-not-prepared': { message: 'A pasta de configuração do HyperFrames não foi preparada.', whatToDo: 'Rode `studio hyperframes chrome install`.' },
  'trace-missing': {
    message: 'A verificação de rede do HyperFrames não foi feita para esta versão.',
    whatToDo: 'Rode `studio hyperframes trace` e depois `studio hyperframes enable`.',
  },
  'trace-stale': {
    message: 'A verificação de rede do HyperFrames não foi feita para esta versão.',
    whatToDo: 'Rode `studio hyperframes trace` e depois `studio hyperframes enable`.',
  },
  'pin-mismatch': { message: 'A versão instalada do HyperFrames não é a aprovada (0.9.72).', whatToDo: 'Reinstale as dependências do estúdio.' },
  'sandbox-unavailable': {
    message: 'O isolamento de rede do macOS não está disponível.',
    whatToDo: 'O motor HyperFrames não roda sem ele. Use um modelo Remotion.',
  },
  'template-not-flat': { message: `O modelo ${REF} não segue as regras de um modelo HyperFrames.`, whatToDo: 'Corrija o modelo e crie uma nova versão.' },
  'template-not-self-contained': {
    message: `O modelo ${REF} não segue as regras de um modelo HyperFrames.`,
    whatToDo: 'Corrija o modelo e crie uma nova versão.',
  },
  'canvas-mismatch': { message: `O modelo ${REF} não renderiza no formato desta receita.`, whatToDo: 'Use o formato do modelo ou vincule outro modelo.' },
  'duration-out-of-range': { message: `A narração tem duração fora do intervalo do modelo ${REF}.`, whatToDo: 'Ajuste o roteiro ou vincule outro modelo.' },
  'variable-missing': {
    message: `As variáveis do modelo ${REF} não puderam ser preenchidas.`,
    whatToDo: 'Confira `templateVariables` na etapa de composição da receita.',
  },
  'variable-undeclared': {
    message: `As variáveis do modelo ${REF} não puderam ser preenchidas.`,
    whatToDo: 'Confira `templateVariables` na etapa de composição da receita.',
  },
  'variable-type': {
    message: `As variáveis do modelo ${REF} não puderam ser preenchidas.`,
    whatToDo: 'Confira `templateVariables` na etapa de composição da receita.',
  },
};

describe('hyperframesRefusalText (SPEC 0008 section 5.7)', () => {
  for (const reason of HyperframesRefusalReasonSchema.options) {
    it(`answers the section 5.7 text for ${reason}`, () => {
      assert.deepEqual(hyperframesRefusalText(reason, REF), sectionFiveSeven[reason]);
    });
  }

  it('covers all fourteen refusal reasons with a non-empty message and next step', () => {
    assert.equal(HyperframesRefusalReasonSchema.options.length, 14);
    for (const reason of HyperframesRefusalReasonSchema.options) {
      const text = hyperframesRefusalText(reason, REF);
      assert.ok(text.message.trim().length > 0, `${reason} has no message`);
      assert.ok(text.whatToDo.trim().length > 0, `${reason} has no next step`);
    }
  });

  it('names the bound template in the template, canvas, duration and variable refusals and nowhere else', () => {
    const naming = new Set<HyperframesRefusalReason>([
      'template-not-flat',
      'template-not-self-contained',
      'canvas-mismatch',
      'duration-out-of-range',
      'variable-missing',
      'variable-undeclared',
      'variable-type',
    ]);
    for (const reason of HyperframesRefusalReasonSchema.options) {
      assert.equal(hyperframesRefusalText(reason, 'other-template@3').message.includes('other-template@3'), naming.has(reason), reason);
    }
  });

  it('keeps the HyperFrames run activity of section 7', () => {
    assert.equal(stageTexts.hyperframesRendering(REF), `Renderizando o modelo ${REF} (HyperFrames).`);
  });
});
