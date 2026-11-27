import type { Messages } from '@studio/ui';
import { runsPtBR } from './runs/pt-BR';
import { catalogPtBR } from './catalog/pt-BR';
import { recipesPtBR } from './recipes/pt-BR';
import { skillsPtBR } from './skills/pt-BR';
import { schedulesPtBR } from './schedules/pt-BR';
import { curationsPtBR } from './curations/pt-BR';
import { metricsPtBR } from './metrics/pt-BR';
import { commonPtBR } from './common/pt-BR';
import { publishingPtBR } from './publishing/pt-BR';
import { platformsPtBR } from './platforms/pt-BR';
import { authPtBR } from './auth/pt-BR';
import { cartPtBR } from './cart/pt-BR';
import { favoritesPtBR } from './favorites/pt-BR';
import { wizardPtBR } from './wizard/pt-BR';

/** Texts of the web app, one section per feature folder. pt-BR is the source of truth for `WebMessages`. */
export const webPtBR = {
  app: {
    productName: 'EngineOS Video Creator',
  },
  shell: {
    logout: 'Sair',
    help: {
      button: 'Como usar',
      title: 'Como usar o Video Studio',
      description: 'O caminho do primeiro uso até um vídeo publicado.',
      diagramAlt:
        'Fluxo de uso do Video Studio: instalar, guardar as chaves dos provedores, rodar a verificação, entrar no studio, iniciar uma execução, aprovar o plano, produzir o vídeo, revisar e publicar; as métricas voltam para os indicadores.',
      close: 'Fechar ajuda',
      done: 'Entendi',
      tips: {
        commands: {
          title: 'Comandos do dia a dia',
          items: {
            first: 'studio start / stop / status',
            second: 'studio doctor quando algo parecer errado',
            third: 'studio catalog seed recarrega seeds/ com segurança',
          },
        },
        output: {
          title: 'Onde seu vídeo fica',
          items: {
            first: 'Cada execução fica em runs/<runId>/ na pasta de dados',
            second: 'final.mp4, report.md e cost.json são gravados lá',
            third: 'Compare execuções lado a lado em Comparações',
          },
        },
        safety: {
          title: 'Portões e segurança',
          items: {
            first: 'Plano ou revisão rejeitados encerram a execução: comece outra',
            second: 'Só chamadas a provedores de IA saem do Mac, cada uma registrada',
            third: 'Publicar só acontece depois que você aprova a execução',
          },
        },
      },
    },
    brandLink: 'EngineOS Video Creator, ir para Execuções',
    navigation: {
      create: 'Criar vídeo',
      catalog: 'Catálogo',
      recipes: 'Presets',
      skills: 'Skills',
      runs: 'Execuções',
      comparisons: 'Comparações',
      schedules: 'Agendamentos',
      metrics: 'Métricas',
      indicators: 'Indicadores',
      accounts: 'Contas',
    },
    navigationGroups: {
      content: 'Conteúdo',
      production: 'Produção',
      publishing: 'Publicação',
    },
    account: {
      name: 'Proprietário',
      sessionUntil: (time: string): string => `Sessão até ${time}`,
    },
  },
  runs: runsPtBR,
  catalog: catalogPtBR,
  recipes: recipesPtBR,
  skills: skillsPtBR,
  schedules: schedulesPtBR,
  curations: curationsPtBR,
  metrics: metricsPtBR,
  common: commonPtBR,
  publishing: publishingPtBR,
  platforms: platformsPtBR,
  auth: authPtBR,
  cart: cartPtBR,
  favorites: favoritesPtBR,
  wizard: wizardPtBR,
} as const;

export type WebMessages = Messages<typeof webPtBR>;
