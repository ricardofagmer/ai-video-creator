/** Favorites on the catalog and receitas pages: a mark and a filter, kept in this browser. pt-BR is the source of truth. */
export const favoritesPtBR = {
  addHidden: (name: string): string => `Favoritar ${name}`,
  removeHidden: (name: string): string => `Tirar ${name} dos favoritos`,
  full: (max: number): string => `Limite de ${max} favoritos atingido`,
  onlyWithCount: (count: number): string => `Só favoritos (${count})`,
  emptyTitle: 'Nenhum favorito nesta lista',
  emptyDescription: 'Marque a estrela de um item para ele aparecer aqui.',
  showAll: 'Mostrar tudo',
};
