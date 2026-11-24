import type { Messages } from '@studio/ui';
import type { favoritesPtBR } from './pt-BR';

export const favoritesEn: Messages<typeof favoritesPtBR> = {
  addHidden: (name: string) => `Add ${name} to favorites`,
  removeHidden: (name: string) => `Remove ${name} from favorites`,
  full: (max: number) => `Limit of ${max} favorites reached`,
  onlyWithCount: (count: number) => `Favorites only (${count})`,
  emptyTitle: 'No favorites in this list',
  emptyDescription: 'Mark the star of an item to see it here.',
  showAll: 'Show all',
};
