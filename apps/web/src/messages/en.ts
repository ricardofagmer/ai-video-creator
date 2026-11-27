import type { WebMessages } from './pt-BR';
import { runsEn } from './runs/en';
import { catalogEn } from './catalog/en';
import { recipesEn } from './recipes/en';
import { skillsEn } from './skills/en';
import { schedulesEn } from './schedules/en';
import { curationsEn } from './curations/en';
import { metricsEn } from './metrics/en';
import { commonEn } from './common/en';
import { publishingEn } from './publishing/en';
import { platformsEn } from './platforms/en';
import { authEn } from './auth/en';
import { cartEn } from './cart/en';
import { favoritesEn } from './favorites/en';
import { wizardEn } from './wizard/en';

export const webEn: WebMessages = {
  app: {
    productName: 'EngineOS Video Creator',
  },
  shell: {
    logout: 'Sign out',
    help: {
      button: 'How to use',
      title: 'How to Use Video Studio',
      description: 'The path from first setup to a published video.',
      diagramAlt:
        'Video Studio usage flow: install, store the provider keys, run the health check, sign in to the studio, start a run, approve the plan, produce the video, review it and publish; metrics flow back to the insights.',
      close: 'Close help',
      done: 'Got it',
      tips: {
        commands: {
          title: 'Everyday commands',
          items: {
            first: 'studio start / stop / status',
            second: 'studio doctor when something looks wrong',
            third: 'studio catalog seed reloads seeds/ safely',
          },
        },
        output: {
          title: 'Where your video lands',
          items: {
            first: 'Each run lives in runs/<runId>/ in the data folder',
            second: 'final.mp4, report.md and cost.json are written there',
            third: 'Compare runs side by side in Comparisons',
          },
        },
        safety: {
          title: 'Gates and safety',
          items: {
            first: 'A rejected plan or review ends the run: start a new one',
            second: 'Only AI provider calls leave the Mac, each one logged',
            third: 'Publishing happens only after you approve the run',
          },
        },
      },
    },
    brandLink: 'EngineOS Video Creator, go to Runs',
    navigation: {
      create: 'Create video',
      catalog: 'Catalog',
      recipes: 'Presets',
      skills: 'Skills',
      runs: 'Runs',
      comparisons: 'Comparisons',
      schedules: 'Schedules',
      metrics: 'Metrics',
      indicators: 'Insights',
      accounts: 'Accounts',
    },
    navigationGroups: {
      content: 'Content',
      production: 'Production',
      publishing: 'Publishing',
    },
    account: {
      name: 'Owner',
      sessionUntil: (time) => `Session until ${time}`,
    },
  },
  runs: runsEn,
  catalog: catalogEn,
  recipes: recipesEn,
  skills: skillsEn,
  schedules: schedulesEn,
  curations: curationsEn,
  metrics: metricsEn,
  common: commonEn,
  publishing: publishingEn,
  platforms: platformsEn,
  auth: authEn,
  cart: cartEn,
  favorites: favoritesEn,
  wizard: wizardEn,
};
