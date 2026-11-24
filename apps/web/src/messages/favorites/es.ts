import type { Messages } from '@studio/ui';
import type { favoritesPtBR } from './pt-BR';

export const favoritesEs: Messages<typeof favoritesPtBR> = {
  addHidden: (name: string) => `Marcar ${name} como favorito`,
  removeHidden: (name: string) => `Quitar ${name} de favoritos`,
  full: (max: number) => `Límite de ${max} favoritos alcanzado`,
  onlyWithCount: (count: number) => `Solo favoritos (${count})`,
  emptyTitle: 'Ningún favorito en esta lista',
  emptyDescription: 'Marca la estrella de un elemento para verlo aquí.',
  showAll: 'Mostrar todo',
};
