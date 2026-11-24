'use client';

import { FormField, Input } from '@studio/ui';
import { useState, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { cartInstructionsActions, useCartSourceUrl } from '../cart-instructions-store';
import { CART_SOURCE_URL_MAX, checkoutSourceUrlFrom, checkoutSourceUrlText, firstCartSiteUrl } from '../cart-source-url';
import { type CartItem } from '../cart-store';

interface CartSourceUrlFieldProps {
  cart: readonly CartItem[];
}

/**
 * docs/specs/2026-11-23-site-analysis-design.md point 6: the page the run's research stage reads and the
 * AI analyses. It starts with the cart's first site and the owner can change it; only `https:` is carried.
 */
export function CartSourceUrlField({ cart }: CartSourceUrlFieldProps): ReactElement {
  const texts = useWebMessages().cart.site;
  const typed = useCartSourceUrl();
  const [touched, setTouched] = useState(false);
  const value = checkoutSourceUrlText(typed, cart);
  const invalid = touched && value.trim() !== '' && checkoutSourceUrlFrom(value) === null;
  const fromCartSite = typed === null && firstCartSiteUrl(cart) !== null;

  return (
    <FormField
      id="carrinho-site"
      label={texts.label}
      optional
      help={fromCartSite ? `${texts.help} ${texts.fromCartSite}` : texts.help}
      error={invalid ? texts.onlyHttps : undefined}
    >
      {({ invalid: controlInvalid, ...control }) => (
        <Input
          {...control}
          type="url"
          inputMode="url"
          invalid={controlInvalid}
          maxLength={CART_SOURCE_URL_MAX}
          placeholder="https://…"
          value={value}
          onChange={(event) => cartInstructionsActions.setSourceUrl(event.currentTarget.value)}
          onBlur={() => setTouched(true)}
        />
      )}
    </FormField>
  );
}
