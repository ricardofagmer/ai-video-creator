'use client';

import { Button, Icon } from '@studio/ui';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { MAX_CART_ITEMS, cartActions, useCart, type CartItem } from '../cart-store';

interface CartToggleButtonProps {
  item: CartItem;
  size?: 'sm' | 'md';
  /** Icon without the visible label (small library tiles); the aria-label and the tooltip still name the action. */
  iconOnly?: boolean;
}

/** Adds or removes one catalog version from the cart; `aria-pressed` tells which state it is in. */
export function CartToggleButton({ item, size = 'sm', iconOnly = false }: CartToggleButtonProps): ReactElement {
  const t = useWebMessages();
  const texts = t.cart;
  const cart = useCart();
  const inCart = cart.some((existing) => existing.ref === item.ref);
  const full = !inCart && cart.length >= MAX_CART_ITEMS;
  const label = inCart ? texts.added : texts.add;
  const tooltip = full ? texts.full(MAX_CART_ITEMS) : iconOnly ? label : undefined;

  return (
    <Button
      type="button"
      variant={inCart ? 'primary' : 'secondary'}
      size={size}
      aria-pressed={inCart}
      aria-label={inCart ? texts.removeHidden(item.name) : texts.addHidden(item.name)}
      title={tooltip}
      disabled={full}
      onClick={() => (inCart ? cartActions.remove(item.ref) : cartActions.add(item))}
    >
      <Icon name="cart" size="sm" />
      {!iconOnly && <span>{label}</span>}
    </Button>
  );
}
