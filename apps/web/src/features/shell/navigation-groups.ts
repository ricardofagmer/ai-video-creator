import type { IconName } from '@studio/ui';
import type { WebMessages } from '@/messages';

export interface StudioNavLink {
  href: string;
  key: keyof WebMessages['shell']['navigation'];
  icon: IconName;
}

export interface StudioNavGroup {
  key: keyof WebMessages['shell']['navigationGroups'];
  links: readonly StudioNavLink[];
}

/**
 * design/telas/01: Catálogo · Receitas · Execuções; rev 3 (SPEC 0003 section 5.3) adds Comparações;
 * SPEC 0006 adds Agendamentos (section 5.7) and Métricas, the CSV import (section 5.9); SPEC 0007
 * adds Contas, the connected platforms (section 5.9). The drawer groups them in pipeline order:
 * material, making videos, what happens after publishing.
 */
export const studioNavigationGroups: readonly StudioNavGroup[] = [
  {
    key: 'content',
    links: [
      { href: '/catalogo', key: 'catalog', icon: 'folder' },
      { href: '/receitas', key: 'recipes', icon: 'clipboard' },
    ],
  },
  {
    key: 'production',
    links: [
      // Guided-creation spec section 5: the wizard opens the production group.
      { href: '/criar', key: 'create', icon: 'plus' },
      { href: '/execucoes', key: 'runs', icon: 'play-circle' },
      { href: '/comparacoes', key: 'comparisons', icon: 'columns' },
      { href: '/agendamentos', key: 'schedules', icon: 'calendar' },
    ],
  },
  {
    key: 'publishing',
    links: [
      { href: '/metricas/importar', key: 'metrics', icon: 'bar-chart' },
      { href: '/indicadores', key: 'indicators', icon: 'trending-up' },
      { href: '/contas', key: 'accounts', icon: 'link' },
    ],
  },
];
