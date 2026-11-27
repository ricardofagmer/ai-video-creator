import type { WebMessages } from './pt-BR';
import { runsEs } from './runs/es';
import { catalogEs } from './catalog/es';
import { recipesEs } from './recipes/es';
import { skillsEs } from './skills/es';
import { schedulesEs } from './schedules/es';
import { curationsEs } from './curations/es';
import { metricsEs } from './metrics/es';
import { commonEs } from './common/es';
import { publishingEs } from './publishing/es';
import { platformsEs } from './platforms/es';
import { authEs } from './auth/es';
import { cartEs } from './cart/es';
import { favoritesEs } from './favorites/es';
import { wizardEs } from './wizard/es';

export const webEs: WebMessages = {
  app: {
    productName: 'EngineOS Video Creator',
  },
  shell: {
    logout: 'Salir',
    help: {
      button: 'Cómo usar',
      title: 'Cómo usar Video Studio',
      description: 'El camino desde la primera configuración hasta un video publicado.',
      diagramAlt:
        'Flujo de uso de Video Studio: instalar, guardar las claves de los proveedores, ejecutar la verificación, entrar al studio, iniciar una ejecución, aprobar el plan, producir el video, revisarlo y publicarlo; las métricas vuelven a los indicadores.',
      close: 'Cerrar ayuda',
      done: 'Entendido',
      tips: {
        commands: {
          title: 'Comandos diarios',
          items: {
            first: 'studio start / stop / status',
            second: 'studio doctor cuando algo parezca mal',
            third: 'studio catalog seed recarga seeds/ con seguridad',
          },
        },
        output: {
          title: 'Dónde queda tu video',
          items: {
            first: 'Cada ejecución vive en runs/<runId>/ en la carpeta de datos',
            second: 'final.mp4, report.md y cost.json se escriben allí',
            third: 'Compara ejecuciones lado a lado en Comparaciones',
          },
        },
        safety: {
          title: 'Puertas y seguridad',
          items: {
            first: 'Un plan o revisión rechazados terminan la ejecución: empieza otra',
            second: 'Solo las llamadas a proveedores de IA salen del Mac, cada una registrada',
            third: 'Publicar ocurre solo después de que apruebas la ejecución',
          },
        },
      },
    },
    brandLink: 'EngineOS Video Creator, ir a Ejecuciones',
    navigation: {
      create: 'Crear video',
      catalog: 'Catálogo',
      recipes: 'Presets',
      skills: 'Skills',
      runs: 'Ejecuciones',
      comparisons: 'Comparaciones',
      schedules: 'Programaciones',
      metrics: 'Métricas',
      indicators: 'Indicadores',
      accounts: 'Cuentas',
    },
    navigationGroups: {
      content: 'Contenido',
      production: 'Producción',
      publishing: 'Publicación',
    },
    account: {
      name: 'Propietario',
      sessionUntil: (time) => `Sesión hasta ${time}`,
    },
  },
  runs: runsEs,
  catalog: catalogEs,
  recipes: recipesEs,
  skills: skillsEs,
  schedules: schedulesEs,
  curations: curationsEs,
  metrics: metricsEs,
  common: commonEs,
  publishing: publishingEs,
  platforms: platformsEs,
  auth: authEs,
  cart: cartEs,
  favorites: favoritesEs,
  wizard: wizardEs,
};
