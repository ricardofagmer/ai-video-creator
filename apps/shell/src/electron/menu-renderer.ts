import { Menu, type MenuItemConstructorOptions } from 'electron';
import { type MenuActionId, type MenuItemModel } from '../menu/menu-model';

export interface MenuHandlers {
  readonly onAction: (id: MenuActionId) => void;
  readonly onOpenAtLoginChange: (checked: boolean) => void;
}

function toTemplateItem(item: MenuItemModel, handlers: MenuHandlers): MenuItemConstructorOptions {
  switch (item.kind) {
    case 'separator':
      return { type: 'separator' };
    case 'info':
      return { label: item.label, enabled: false };
    case 'action':
      return { label: item.label, enabled: item.enabled, click: () => handlers.onAction(item.id) };
    case 'checkbox':
      return { label: item.label, type: 'checkbox', checked: item.checked, click: (menuItem) => handlers.onOpenAtLoginChange(menuItem.checked) };
  }
}

/** Renders the pure menu model; every decision about labels and enabled state was made there. */
export function renderMenu(items: readonly MenuItemModel[], handlers: MenuHandlers): Menu {
  return Menu.buildFromTemplate(items.map((item) => toTemplateItem(item, handlers)));
}
