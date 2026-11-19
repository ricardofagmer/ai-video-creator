import { type StageId } from '@studio/shared/run-format';

/** Id recorded in every brief this template set renders; bump it when the wording changes. */
// v2 (SPEC 0003 R2-07): adds the "Aprendizados do catálogo" section after "## Brief".
export const STAGE_BRIEF_TEMPLATE_ID = 'stage-brief-v2';

export interface StageBriefTemplate {
  title: string;
  goal: string;
}

/**
 * pt-BR title and goal per stage (D16, SPEC 0002 A5 and RUN-FORMAT section 6). Rendering is a
 * plain substitution with no model call (topology section 2, K1).
 */
export const stageBriefTemplates: Readonly<Record<StageId, StageBriefTemplate>> = {
  plan: {
    title: 'Plano da execução',
    goal: 'Transformar o brief e a receita no plano: fases, etapas, verificações e estimativa de custo. O plano passa pela sua aprovação.',
  },
  research: {
    title: 'Pesquisa da fonte',
    goal: 'Capturar a URL de origem do brief e extrair o texto da página.',
  },
  verify: {
    title: 'Verificação das afirmações',
    goal: 'Transformar cada mensagem-chave em uma afirmação com evidência no texto capturado.',
  },
  script: {
    title: 'Roteiro',
    goal: 'Escrever o roteiro e a narração de cada cena, citando apenas afirmações verificadas, com revisão automática.',
  },
  capture: {
    title: 'Capturas de tela',
    goal: 'Gravar as telas do app que as cenas vão usar e registrar o índice de capturas.',
  },
  scenes: {
    title: 'Direção de cenas',
    goal: 'Ligar cada cena do roteiro a capturas, ativos, movimento de câmera e texto na tela, com revisão automática.',
  },
  narration: {
    title: 'Narração',
    goal: 'Gerar o áudio da narração de cada cena e o índice de tempos.',
  },
  composition: {
    title: 'Composição',
    goal: 'Montar o vídeo no modelo da receita a partir de cenas, capturas e narração.',
  },
  captions: {
    title: 'Legendas',
    goal: 'Gravar as legendas sobre o vídeo na posição definida pela receita.',
  },
  fades: {
    title: 'Transições de entrada e saída',
    goal: 'Aplicar fade de entrada e de saída ao vídeo.',
  },
  music: {
    title: 'Trilha sonora',
    goal: 'Mixar a trilha sob a narração com ducking e o alvo de loudness da receita.',
  },
  qa: {
    title: 'QA técnico',
    goal: 'Medir contêiner, codec, resolução, fps, duração, loudness, pico, áudio e trechos pretos do vídeo.',
  },
  'agent-review': {
    title: 'Revisão automática do vídeo',
    goal: 'Registrar a avaliação do revisor sobre o vídeo renderizado, apenas como evidência.',
  },
  package: {
    title: 'Pacote final',
    goal: 'Montar final.mp4, manifest.json, cost.json, qa/ e report.md antes da sua revisão.',
  },
};
